//! Tabs, folders and spaces: the model ([`model`]), its persistence ([`store`]), and the runtime
//! that keeps one native webview per *loaded* tab in sync with it.
//!
//! Memory: a tab gets a webview only when it's first shown (restored tabs stay unloaded until
//! selected, like Zen's pending tabs). At most `MAX_LOADED_TABS` stay loaded (LRU), idle ones are
//! unloaded, and hidden ones ask WebView2 to trim memory.
//!
//! Threading: on Windows, creating a webview from the main thread's command or event handlers
//! deadlocks, so every operation that may load a tab runs from an async command or a worker thread.
//! Operations hold `ops` for their whole run (effects apply in order) but never hold `model` while
//! touching a webview, because webview events lock `model` on the main thread.

pub mod commands;
mod model;
mod store;
mod view;

use std::{
  sync::Mutex,
  thread,
  time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::{
  webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder},
  AppHandle, Emitter, EventTarget, LogicalPosition, LogicalSize, Manager, State, Url, Webview, WebviewUrl,
};

use crate::{content, SCROLL_BAR_STYLE, UI_LABEL};
use model::{Effect, Id, Model, Session};
use view::{TabView, TabsState};


const HOME_URL: &str = "https://google.com";
const SEARCH_URL: &str = "https://google.com/";

/// How often idle tabs are checked for unloading.
const IDLE_CHECK: Duration = Duration::from_secs(60);

const TAB_LABEL_PREFIX: &str = "tab-";

pub struct Browser {
  model: Mutex<Model>,
  /// Serialises operations, so the effects of one never interleave with another's.
  ops: Mutex<()>,
  /// The tab whose webview is on screen. Lags the model only while an operation's effects apply.
  shown: Mutex<Option<Id>>,
  store: store::Store,
}

/// Payload of "page-changed": the shown tab's page.
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageChanged {
  url: String,
  title: Option<String>,
  can_go_back: bool,
  can_go_forward: bool,
  is_loading: bool,
}

fn now() -> u64 {
  SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn browser(app: &AppHandle) -> State<'_, Browser> {
  app.state()
}

fn label(id: Id) -> String {
  format!("{TAB_LABEL_PREFIX}{id}")
}

fn tab_webview(app: &AppHandle, id: Id) -> Option<Webview> {
  app.get_webview(&label(id))
}

/// The webview on screen, if any. The content shape commands apply to it.
pub fn shown_webview(app: &AppHandle) -> Option<Webview> {
  let id = (*browser(app).shown.lock().unwrap())?;
  tab_webview(app, id)
}

/// Loads the saved session and shows its active tab. Call once the window exists.
pub fn init(app: &AppHandle) -> tauri::Result<()> {
  // A folder of our own: the app data dir is named after the bundle identifier, which is still
  // Tauri's default (`com.tauri.dev`) and shared with other apps built from the template.
  let dir = app.path().app_data_dir()?.join("ezel");
  let session = store::load(&dir).map(|s| s.repaired(HOME_URL, now())).unwrap_or_else(|| Session::new(HOME_URL, now()));
  app.manage(Browser {
    model: Mutex::new(Model::new(session)),
    ops: Mutex::new(()),
    shown: Mutex::new(None),
    store: store::Store::new(dir),
  });
  if let Err(e) = update(app, |m, now| Ok(((), m.restore(now)))) {
    log::error!("failed to restore tabs: {e}");
  }

  let app = app.clone();
  thread::Builder::new().name("tab-unloader".into()).spawn(move || loop {
    thread::sleep(IDLE_CHECK);
    let _ = update(&app, |m, now| Ok(((), m.unload_idle(now))));
  })?;
  Ok(())
}

/// Writes pending session changes to disk. Call at exit.
pub fn flush(app: &AppHandle) {
  if let Some(browser) = app.try_state::<Browser>() {
    browser.store.save(&browser.model.lock().unwrap().session);
    browser.store.flush();
  }
}

/// Runs one operation: edits the model, applies its effects to the webviews, then tells the UI
/// and queues a save. Not from the main thread (see the module docs).
fn update<T>(app: &AppHandle, op: impl FnOnce(&mut Model, u64) -> model::Result<(T, Vec<Effect>)>) -> Result<T, String> {
  let browser = browser(app);
  let _op = browser.ops.lock().unwrap();
  let (value, effects) = op(&mut browser.model.lock().unwrap(), now())?;
  for effect in effects {
    apply(app, effect);
  }
  let model = browser.model.lock().unwrap();
  let _ = app.emit_to(EventTarget::webview(UI_LABEL), "tabs-changed", TabsState::of(&model));
  browser.store.save(&model.session);
  Ok(value)
}

/// [`update`] for operations with no webview effects.
fn edit<T>(app: &AppHandle, op: impl FnOnce(&mut Model) -> model::Result<T>) -> Result<T, String> {
  update(app, |m, _| op(m).map(|value| (value, vec![])))
}

fn apply(app: &AppHandle, effect: Effect) {
  match effect {
    Effect::Show(next) => show(app, next),
    Effect::Destroy(id) => {
      if let Some(webview) = tab_webview(app, id) {
        let _ = webview.close();
      }
      let browser = browser(app);
      let mut shown = browser.shown.lock().unwrap();
      if *shown == Some(id) {
        *shown = None;
      }
    }
    Effect::Navigate(id, url) => {
      if let (Some(webview), Ok(url)) = (tab_webview(app, id), Url::parse(&url)) {
        let _ = webview.navigate(url);
      }
    }
  }
}

/// Puts `next` on screen (creating its webview if needed), then hides the previous tab, in that
/// order so switching never flashes the UI behind the page.
fn show(app: &AppHandle, next: Option<Id>) {
  let previous = std::mem::replace(&mut *browser(app).shown.lock().unwrap(), next);
  match next {
    Some(id) => match tab_webview(app, id).map(Ok).unwrap_or_else(|| create_webview(app, id)) {
      Ok(webview) => {
        content::present(&webview);
        set_low_memory(&webview, false);
        publish_page(&webview, id);
      }
      Err(e) => {
        log::error!("tab {id}: failed to create its webview: {e}");
        browser(app).model.lock().unwrap().live.remove(&id);
        *browser(app).shown.lock().unwrap() = None;
        emit_page(app, PageChanged::default());
      }
    },
    None => emit_page(app, PageChanged::default()),
  }
  if let Some(previous) = previous.filter(|p| Some(*p) != next) {
    if let Some(webview) = tab_webview(app, previous) {
      let _ = webview.hide();
      set_low_memory(&webview, true);
    }
  }
}

fn create_webview(app: &AppHandle, id: Id) -> tauri::Result<Webview> {
  let url = browser(app).model.lock().unwrap().tab(id).map(|t| t.url.clone()).unwrap_or_default();
  let url = Url::parse(&url).unwrap_or_else(|_| Url::parse("about:blank").unwrap());
  let window = app.get_window(crate::WINDOW_LABEL).ok_or(tauri::Error::WindowNotFound)?;

  let opener = app.clone();
  let builder = WebviewBuilder::new(label(id), WebviewUrl::External(url))
    // Every tab shares the ui webview's data directory, so they must use the same scrollbar style.
    .scroll_bar_style(SCROLL_BAR_STYLE)
    .on_page_load(move |webview, payload| {
      let started = matches!(payload.event(), PageLoadEvent::Started);
      on_page_event(&webview, id, Some(payload.url().to_string()), started.then_some(None), Some(started));
    })
    .on_document_title_changed(move |webview, title| on_page_event(&webview, id, None, Some(Some(title)), None))
    .on_new_window(move |url, features| {
      // Sized requests are popups (OAuth, payment): let WebView2 open its own window so
      // `window.opener` keeps working. Links (target=_blank, middle-click) open as new tabs.
      if features.size().is_some() {
        return NewWindowResponse::Allow;
      }
      let app = opener.clone();
      // Off the main thread: creating a webview from this handler deadlocks on Windows.
      tauri::async_runtime::spawn(async move {
        let _ = update(&app, |m, now| Ok(m.open_tab(url.to_string(), now)));
      });
      NewWindowResponse::Deny
    });
  let webview = window.add_child(builder, LogicalPosition::new(0.0, 0.0), LogicalSize::new(0.0, 0.0))?;
  watch_platform_events(&webview, id);
  Ok(webview)
}

/// A tab's page changed: record it, tell the UI about the tab, and about the page if it's shown.
/// `title: Some(None)` clears the title (a new navigation started); `loading: None` = unchanged.
fn on_page_event(webview: &Webview, id: Id, url: Option<String>, title: Option<Option<String>>, loading: Option<bool>) {
  let app = webview.app_handle();
  {
    let browser = browser(app);
    let mut model = browser.model.lock().unwrap();
    model.update_page(id, url, title);
    if let (Some(live), Some(loading)) = (model.live.get_mut(&id), loading) {
      live.is_loading = loading;
    }
    browser.store.save(&model.session);
    emit_tab(app, &model, id);
  }
  publish_page(webview, id);
}

fn emit_tab(app: &AppHandle, model: &Model, id: Id) {
  if let Some(tab) = TabView::of(model, id) {
    let _ = app.emit_to(EventTarget::webview(UI_LABEL), "tab-updated", tab);
  }
}

/// Reads the tab's back/forward state, then emits "page-changed" if the tab is the one shown.
fn publish_page(webview: &Webview, id: Id) {
  let app = webview.app_handle().clone();
  let publish = move |history: (bool, bool)| {
    let browser = browser(&app);
    let page = {
      let mut model = browser.model.lock().unwrap();
      if let Some(live) = model.live.get_mut(&id) {
        (live.can_go_back, live.can_go_forward) = history;
      }
      page_of(&model, id)
    };
    if *browser.shown.lock().unwrap() == Some(id) {
      emit_page(&app, page);
    }
  };

  #[cfg(windows)]
  let _ = webview.with_webview(move |pw| publish(crate::webview2::history(&pw)));

  // TODO: read back/forward state on macOS (WKWebView) and Linux (WebKitGTK).
  #[cfg(not(windows))]
  publish((false, false));
}

fn page_of(model: &Model, id: Id) -> PageChanged {
  let (Ok(tab), Some(live)) = (model.tab(id), model.live.get(&id)) else { return PageChanged::default() };
  PageChanged {
    url: tab.url.clone(),
    title: tab.title.clone(),
    can_go_back: live.can_go_back,
    can_go_forward: live.can_go_forward,
    is_loading: live.is_loading,
  }
}

fn emit_page(app: &AppHandle, page: PageChanged) {
  let _ = app.emit_to(EventTarget::webview(UI_LABEL), "page-changed", page);
}

fn set_low_memory(webview: &Webview, low: bool) {
  #[cfg(windows)]
  let _ = webview.with_webview(move |pw| crate::webview2::set_low_memory(&pw, low));
  #[cfg(not(windows))]
  let _ = (webview, low);
}

/// Favicon, audio and shortcut events the platform webview reports.
fn watch_platform_events(webview: &Webview, id: Id) {
  #[cfg(windows)]
  {
    let app = webview.app_handle().clone();
    let _ = webview.with_webview(move |pw| {
      use crate::webview2;
      let a = app.clone();
      webview2::on_favicon_changed(&pw, move |favicon| {
        let browser = browser(&a);
        let mut model = browser.model.lock().unwrap();
        model.set_favicon(id, favicon);
        browser.store.save(&model.session);
        emit_tab(&a, &model, id);
      });
      let a = app.clone();
      webview2::on_audio_changed(&pw, move |playing| {
        let browser = browser(&a);
        let mut model = browser.model.lock().unwrap();
        if let Some(live) = model.live.get_mut(&id) {
          live.playing_audio = playing;
        }
        emit_tab(&a, &model, id);
      });
      webview2::forward_shortcuts(&pw, move || {
        let _ = app.emit_to(EventTarget::webview(UI_LABEL), "toggle-sidebar", ());
      });
    });
  }

  // TODO: favicons, audio state and shortcut forwarding on macOS and Linux.
  #[cfg(not(windows))]
  let _ = (webview, id);
}
