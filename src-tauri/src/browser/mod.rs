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
pub mod downloads;
pub mod layers;
pub mod memory;
mod model;
pub mod page_menu;
pub mod permissions;
#[cfg(feature = "perf")]
mod perf;
mod popup;
pub mod site;
mod url_policy;
mod store;
mod view;
pub mod zen_import;

use std::{
  collections::HashSet,
  sync::Mutex,
  thread,
  time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use specta::Type;
use tauri::{
  webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder},
  AppHandle, Manager, State, Url, Webview, WebviewUrl,
};
use tauri_specta::Event;

use crate::{content, emit_to_ui, error::AppError, BROWSER_ARGS, SCROLL_BAR_STYLE};
use model::{Effect, Id, Model, Session};
pub use view::{TabView, TabsState};


const HOME_URL: &str = "https://google.com";
const SEARCH_URL: &str = "https://google.com/";

/// How often idle tabs are checked for unloading: a tab rests within 15s of reaching
/// `IDLE_UNLOAD_MS`. The check is a lock and a scan of the loaded tabs, so it costs nothing.
const IDLE_CHECK: Duration = Duration::from_secs(15);

const TAB_LABEL_PREFIX: &str = "tab-";

/// A new tab's webview stays hidden until its page starts rendering (or this long at most, so a
/// slow site still shows its loading page). Shown at once, it flashed WebView2's white default
/// background, part-drawn, before the page painted (most visible at launch).
const REVEAL_FALLBACK: Duration = Duration::from_millis(1500);

pub struct Browser {
  model: Mutex<Model>,
  /// Serialises operations, so the effects of one never interleave with another's.
  ops: Mutex<()>,
  /// The tab whose webview is on screen. Lags the model only while an operation's effects apply.
  shown: Mutex<Option<Id>>,
  /// Tabs whose webview was just created and has no page on screen yet: kept hidden (see
  /// `REVEAL_FALLBACK`).
  unpainted: Mutex<HashSet<Id>>,
  /// The page menu on screen: which tab, what was right-clicked, what it offers.
  menu: Mutex<Option<OpenMenu>>,
  /// This session's downloads (memory only).
  downloads: Mutex<downloads::Downloads>,
  /// Remembered site permissions (`<app data>/ezel/permissions.json`), and Ezel's prompts waiting
  /// for an answer: id → (tab, origin, kind).
  permissions: Mutex<permissions::Permissions>,
  asking: Mutex<std::collections::HashMap<u32, (Id, String, permissions::SitePermission)>>,
  /// Ezel's own folder in app data (the session's, the permissions').
  data_dir: std::path::PathBuf,
  /// What "Import from Zen" found, until it's imported or looked for again.
  zen: Mutex<Option<zen_import::ZenData>>,
  store: store::Store,
}

/// Payload of "find-changed": the shown tab's find results. `active` is 1-based, 0 for none.
#[derive(Clone, Copy, Debug, Default, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "find-changed")]
pub struct FindChanged {
  pub active: u32,
  pub count: u32,
}

/// Payload of "link-status": the shown page's status text (a hovered link's address), or "" for
/// none. Shown as text only, at most [`MAX_STATUS`] characters.
#[derive(Clone, Debug, Serialize, Type, Event)]
#[tauri_specta(event_name = "link-status")]
pub struct LinkStatus {
  pub text: String,
}

/// Longest status text passed on (a link's address can be huge; the pill shows one line).
const MAX_STATUS: usize = 300;

/// A page's right-click menu waiting for a choice (`choose_page_menu_item`).
pub struct OpenMenu {
  pub id: u32,
  pub tab: Id,
  pub target: page_menu::MenuTarget,
  pub groups: Vec<Vec<page_menu::PageMenuEntry>>,
}

/// Payload of "page-changed": the shown tab's page.
#[derive(Clone, Default, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "page-changed")]
pub struct PageChanged {
  url: String,
  title: Option<String>,
  can_go_back: bool,
  can_go_forward: bool,
  is_loading: bool,
  /// The lock in the titlebar peek.
  security: site::PageSecurity,
  /// The page is in HTML fullscreen: the UI steps aside and the page fills the window.
  fullscreen: bool,
  /// Ezel's own error page shows instead of the website (the webview is hidden).
  error: Option<site::PageError>,
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

/// A tab webview's label (for the IPC isolation test).
#[cfg(test)]
pub fn tab_label(id: Id) -> String {
  label(id)
}

/// A popup window's label (for the IPC isolation test).
#[cfg(test)]
pub fn popup_label(n: u32) -> String {
  popup::label(n)
}

fn tab_webview(app: &AppHandle, id: Id) -> Option<Webview> {
  app.get_webview(&label(id))
}

/// The webview on screen, if any. The content shape commands apply to it.
pub fn shown_webview(app: &AppHandle) -> Option<Webview> {
  let id = (*browser(app).shown.lock().unwrap())?;
  tab_webview(app, id)
}

/// False while the shown tab's webview must stay hidden: its new page has nothing on screen yet,
/// or it failed and Ezel's error page shows instead.
pub fn shown_painted(app: &AppHandle) -> bool {
  let shown = *browser(app).shown.lock().unwrap();
  match shown {
    Some(id) => can_show(app, id),
    None => true,
  }
}

/// The tab's page started rendering (or the fallback ran out): show its webview if it's the shown tab.
fn reveal(app: &AppHandle, id: Id) {
  if !browser(app).unpainted.lock().unwrap().remove(&id) {
    return;
  }
  if *browser(app).shown.lock().unwrap() == Some(id) {
    if let Some(webview) = tab_webview(app, id) {
      content::present(&webview, can_show(app, id));
    }
  }
}

/// The load meter's numbers (`get_memory`): every WebView2 process and Ezel's own, split over the
/// loaded tabs by the frames each process renders (see [`memory`]).
/// - WebView2's COM calls run on the main thread (its rule), posted there through `with_webview`;
///   all waiting happens on a blocking worker, never on the UI thread or an async worker.
/// - Only loaded tabs that still have a webview are asked; one that goes away meanwhile just
///   doesn't answer. The model lock is never held across a webview call.
/// - One reading at a time, and every failure (no answer, a timeout, a dead worker) is
///   `unavailable`: the meter hides, the app carries on.
#[cfg(windows)]
pub async fn memory_report(app: &AppHandle) -> Result<memory::MemoryReport, AppError> {
  use std::sync::mpsc;
  const REPLY: Duration = Duration::from_secs(2);
  static FLIGHT: memory::SingleFlight = memory::SingleFlight::new();
  let flight = FLIGHT.start()?;

  let loaded: Vec<Id> = browser(app).model.lock().unwrap().live.keys().copied().collect();
  let (frame_tx, frame_rx) = mpsc::channel();
  for id in loaded {
    if let Some(webview) = tab_webview(app, id) {
      let tx = frame_tx.clone();
      let _ = webview.with_webview(move |pw| {
        let _ = tx.send((id, crate::webview2::main_frame_id(&pw)));
      });
    }
  }
  drop(frame_tx);
  let ui = app.get_webview(crate::UI_LABEL).ok_or_else(|| AppError::unavailable("no ui webview"))?;
  let (process_tx, process_rx) = mpsc::channel();
  ui.with_webview(move |pw| {
    crate::webview2::process_frames(&pw, move |list| {
      let _ = process_tx.send(list);
    })
  })
  .map_err(|e| AppError::unavailable(format!("webview: {e}")))?;

  tauri::async_runtime::spawn_blocking(move || {
    // Every asked tab answers (or its closure is dropped, ending the channel) well within REPLY.
    let deadline = std::time::Instant::now() + REPLY;
    let mut tabs: Vec<(Id, Option<u32>)> = vec![];
    while let Ok(reply) = frame_rx.recv_timeout(deadline.saturating_duration_since(std::time::Instant::now())) {
      tabs.push(reply);
    }
    // No answer within REPLY (or the main thread dropped the request) is no list.
    let list = process_rx.recv_timeout(REPLY).ok().flatten();
    let report = memory::report(list, &tabs, std::process::id(), memory::process_bytes);
    // The slot frees only once WebView2 has answered or given up, so readings never overlap.
    drop(flight);
    report
  })
  .await
  .map_err(|e| AppError::unavailable(format!("memory worker: {e}")))?
}

/// True while the shown tab's page is loading (Esc then stops it instead of reaching the page).
pub fn shown_is_loading(app: &AppHandle) -> bool {
  let browser = browser(app);
  let Some(id) = *browser.shown.lock().unwrap() else { return false };
  let loading = browser.model.lock().unwrap().live.get(&id).is_some_and(|l| l.is_loading);
  loading
}

/// Loads the saved session and shows its active tab. Call once the window exists.
pub fn init(app: &AppHandle) -> tauri::Result<()> {
  // A folder of our own: the app data dir is named after the bundle identifier, which is still
  // Tauri's default (`com.tauri.dev`) and shared with other apps built from the template.
  let dir = app.path().app_data_dir()?.join("ezel");
  #[cfg(feature = "perf")]
  let perf_tabs = std::env::var(perf::ENV).ok().map(|v| perf::parse(&v));
  #[cfg(feature = "perf")]
  let dir = if perf_tabs.is_some() { app.path().app_data_dir()?.join("ezel-perf") } else { dir };
  let session = store::load(&dir).map(|s| s.repaired(HOME_URL, now())).unwrap_or_else(|| Session::new(HOME_URL, now()));
  // A perf run always starts from the first-run session (its folder is only ever written, never read back).
  #[cfg(feature = "perf")]
  let session = if perf_tabs.is_some() { Session::new(HOME_URL, now()) } else { session };
  app.manage(Browser {
    model: Mutex::new(Model::new(session)),
    ops: Mutex::new(()),
    shown: Mutex::new(None),
    unpainted: Mutex::new(HashSet::new()),
    menu: Mutex::new(None),
    downloads: Mutex::new(downloads::Downloads::default()),
    permissions: Mutex::new(permissions::load(&dir)),
    asking: Mutex::new(Default::default()),
    data_dir: dir.clone(),
    zen: Mutex::new(None),
    store: store::Store::new(dir),
  });
  if let Err(e) = update(app, |m, now| Ok(((), m.restore(now)))) {
    log::error!("failed to restore tabs: {e}");
  }

  #[cfg(feature = "perf")]
  if let Some(tabs) = perf_tabs {
    open_perf_tabs(app, tabs)?;
  }

  let app = app.clone();
  thread::Builder::new().name("tab-unloader".into()).spawn(move || loop {
    thread::sleep(IDLE_CHECK);
    let _ = update(&app, |m, now| {
      let mut effects = m.unload_idle(now);
      effects.extend(m.suspend_idle(now));
      Ok(((), effects))
    });
  })?;
  Ok(())
}

/// Measurement only: replaces the first-run tab with the requested ones, one a second (like a person
/// opening tabs), off the main thread (creating webviews from it deadlocks on Windows).
#[cfg(feature = "perf")]
fn open_perf_tabs(app: &AppHandle, tabs: perf::PerfTabs) -> tauri::Result<()> {
  let urls = match tabs {
    perf::PerfTabs::FirstRun => return Ok(()),
    perf::PerfTabs::Nothing => vec![],
    perf::PerfTabs::Urls(urls) => urls,
  };
  let app = app.clone();
  thread::Builder::new().name("perf-tabs".into()).spawn(move || {
    let first = browser(&app).model.lock().unwrap().active_tab();
    if let Some(first) = first {
      let _ = update(&app, |m, now| Ok(((), m.remove_tab(first, now)?)));
    }
    for url in urls {
      thread::sleep(Duration::from_secs(1));
      let _ = update(&app, |m, now| Ok(m.open_tab(url, now)));
    }
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
fn update<T>(app: &AppHandle, op: impl FnOnce(&mut Model, u64) -> model::Result<(T, Vec<Effect>)>) -> Result<T, AppError> {
  let browser = browser(app);
  let _op = browser.ops.lock().unwrap();
  let (value, effects) = op(&mut browser.model.lock().unwrap(), now())?;
  for effect in effects {
    apply(app, effect);
  }
  let model = browser.model.lock().unwrap();
  emit_to_ui(app, &TabsState::of(&model));
  browser.store.save(&model.session);
  Ok(value)
}

/// [`update`] for operations with no webview effects.
fn edit<T>(app: &AppHandle, op: impl FnOnce(&mut Model) -> model::Result<T>) -> Result<T, AppError> {
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
      // A pinned URL saved by an older build could be anything: only allowed addresses load.
      if !url_policy::is_allowed(&url) {
        return;
      }
      if let (Some(webview), Ok(url)) = (tab_webview(app, id), Url::parse(&url)) {
        let _ = webview.navigate(url);
      }
    }
    Effect::Layer(id, layer, on) => {
      if let Some(webview) = tab_webview(app, id) {
        let _ = webview.eval(if on { layer.apply_script() } else { layer.remove_script() });
      }
    }
    Effect::Suspend(id) => {
      #[cfg(windows)]
      if let Some(webview) = tab_webview(app, id) {
        let _ = webview.with_webview(|pw| crate::webview2::try_suspend(&pw));
      }
      #[cfg(not(windows))]
      let _ = id;
    }
    Effect::SetMuted(id, muted) => {
      if let Some(webview) = tab_webview(app, id) {
        set_muted(&webview, muted);
      }
    }
  }
}

fn set_muted(webview: &Webview, muted: bool) {
  #[cfg(windows)]
  let _ = webview.with_webview(move |pw| crate::webview2::set_muted(&pw, muted));
  // TODO: per-tab mute on macOS and Linux.
  #[cfg(not(windows))]
  let _ = (webview, muted);
}

/// Puts `next` on screen (creating its webview if needed), then hides the previous tab, in that
/// order so switching never flashes the UI behind the page.
fn show(app: &AppHandle, next: Option<Id>) {
  let previous = std::mem::replace(&mut *browser(app).shown.lock().unwrap(), next);
  match next {
    Some(id) => match tab_webview(app, id).map(Ok).unwrap_or_else(|| create_webview(app, id)) {
      Ok(webview) => {
        content::present(&webview, can_show(app, id));
        set_low_memory(&webview, false);
        #[cfg(windows)]
        let _ = webview.with_webview(|pw| crate::webview2::resume(&pw));
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
  // Another tab: the window leaves (or re-enters) fullscreen with it, and the other tabs'
  // permission prompts are declined this once (they can only be asked while on screen).
  apply_fullscreen(app);
  // A link hovered in the previous tab isn't under the pointer any more.
  emit_to_ui(app, &LinkStatus { text: String::new() });
  let stale: Vec<u32> = browser(app).asking.lock().unwrap().iter().filter(|(_, (tab, _, _))| Some(*tab) != next).map(|(id, _)| *id).collect();
  for ask in stale {
    let _ = answer_permission(app, ask, None);
  }
  if let Some(previous) = previous.filter(|p| Some(*p) != next) {
    if let Some(webview) = tab_webview(app, previous) {
      let _ = webview.hide();
      set_low_memory(&webview, true);
    }
  }
}

fn create_webview(app: &AppHandle, id: Id) -> tauri::Result<Webview> {
  let (url, opened_by_page) = {
    let browser = browser(app);
    let model = browser.model.lock().unwrap();
    let url = model.tab(id).map(|t| t.url.clone()).unwrap_or_default();
    (url, model.live.get(&id).is_some_and(|l| l.opened_by_page))
  };
  // A saved address that isn't allowed (an older session, a hand edit) opens a blank page instead.
  // A tab a page just opened may also start at that page's own blob: URL.
  let allowed = |u: &str| if opened_by_page { url_policy::is_allowed_from_page(u) } else { url_policy::is_allowed(u) };
  let url = Some(url)
    .filter(|u| allowed(u))
    .and_then(|u| Url::parse(&u).ok())
    .unwrap_or_else(|| Url::parse(url_policy::FALLBACK).unwrap());
  let window = app.get_window(crate::WINDOW_LABEL).ok_or(tauri::Error::WindowNotFound)?;

  let opener = app.clone();
  let navigator = app.clone();
  let builder = WebviewBuilder::new(label(id), WebviewUrl::External(url))
    // Every tab shares the ui webview's data directory, so they must use the same scrollbar style
    // and browser arguments (which also block autoplay with sound until the page is used).
    .scroll_bar_style(SCROLL_BAR_STYLE)
    .additional_browser_args(BROWSER_ARGS)
    // Quiet defaults (docs/design/decisions.md): no address/form suggestions for now.
    // TODO: turn autofill and password saving back on with the passwords UI.
    .general_autofill_enabled(false)
    // F12 / Ctrl+Shift+I open the page's DevTools, release builds included (a designers' browser).
    .devtools(true)
    // Every navigation the page starts (links, redirects, `location = …`, forms) must go to an
    // allowed address, or a blob: of a web page: file:, javascript:, data: and the rest are
    // cancelled (url_policy).
    .on_navigation(move |url| {
      let allowed = url_policy::is_allowed_from_page(url.as_str());
      if allowed {
        navigation_started(&navigator, id, url.as_str());
      }
      allowed
    })
    .on_page_load(move |webview, payload| {
      let started = matches!(payload.event(), PageLoadEvent::Started);
      on_page_event(&webview, id, Some(payload.url().to_string()), started.then_some(None), Some(started));
    })
    .on_document_title_changed(move |webview, title| on_page_event(&webview, id, None, Some(Some(title)), None))
    .on_new_window(move |url, features| {
      // New windows obey the same rule: web pages, about:blank, or the page's own web blob:.
      if !url_policy::is_allowed_from_page(url.as_str()) {
        return NewWindowResponse::Deny;
      }
      // Sized requests are popups (OAuth, payment): a small window of Ezel's own, titled with
      // its domain, in the same environment so `window.opener` keeps working. Links
      // (target=_blank, middle-click) open as new tabs.
      if features.size().is_some() {
        return popup::open(&opener, &url, features);
      }
      let app = opener.clone();
      // Off the main thread: creating a webview from this handler deadlocks on Windows.
      tauri::async_runtime::spawn(async move {
        let _ = update(&app, |m, now| Ok(m.open_tab_from_page(url.to_string(), now)));
      });
      NewWindowResponse::Deny
    });
  browser(app).unpainted.lock().unwrap().insert(id);
  // At the page's bounds, so its first frame is drawn at the size it's shown at.
  let at = content::current_bounds(app);
  let webview = window.add_child(builder, at.position, at.size)?;
  let fallback = app.clone();
  thread::spawn(move || {
    thread::sleep(REVEAL_FALLBACK);
    let app = fallback.clone();
    let _ = fallback.run_on_main_thread(move || reveal(&app, id));
  });
  watch_platform_events(&webview, id);
  // A new webview starts unmuted; a muted tab stays muted when it (re)loads.
  if browser(app).model.lock().unwrap().tab(id).is_ok_and(|t| t.muted) {
    set_muted(&webview, true);
  }
  Ok(webview)
}

/// A navigation the tab's page starts (or its first load): its address is what a certificate
/// error must match, and the last page's certificate problem is over.
fn navigation_started(app: &AppHandle, id: Id, url: &str) {
  let failed = {
    let browser = browser(app);
    let mut model = browser.model.lock().unwrap();
    let Some(live) = model.live.get_mut(&id) else { return };
    live.cert_error = false;
    live.navigating_to = Some(url.to_string());
    live.error.is_some()
  };
  // Trying again (Reload, a new address): the website comes back.
  if failed {
    set_page_error(app, id, None);
  }
}

/// WebView2 couldn't verify a certificate. It counts for the page only when it's for the page's
/// own address (not a broken image or script on another host).
#[cfg(windows)]
fn certificate_error(app: &AppHandle, id: Id, request: &str) {
  let page = {
    let browser = browser(app);
    let mut model = browser.model.lock().unwrap();
    let tab_url = model.tab(id).map(|t| t.url.clone()).unwrap_or_default();
    let Some(live) = model.live.get_mut(&id) else { return };
    let target = live.navigating_to.clone().unwrap_or(tab_url);
    if site::host_of(request).is_none() || site::host_of(request) != site::host_of(&target) {
      return;
    }
    live.cert_error = true;
    page_of(&model, id)
  };
  if *browser(app).shown.lock().unwrap() == Some(id) {
    emit_page(app, page);
  }
}

/// Payload of "permission-asked": Ezel's prompt in the titlebar peek, for the shown tab's site.
#[derive(Clone, Debug, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "permission-asked")]
pub struct PermissionAsked {
  pub id: u32,
  #[specta(type = TsIdOf)]
  pub tab_id: Id,
  /// The requesting site's host (an embedded frame's own, if it asks).
  pub host: String,
  pub permission: permissions::SitePermission,
}

/// `Id` in the bindings (see `model::TsId`).
type TsIdOf = model::TsId;

/// A site asks for camera, microphone, location or the clipboard. A remembered answer stands; a
/// tab that isn't on screen is refused (it can't be asked); otherwise Ezel's prompt asks.
#[cfg(windows)]
fn permission_requested(app: &AppHandle, id: Id, uri: &str, permission: permissions::SitePermission) -> crate::webview2::PermissionAnswer {
  use crate::webview2::PermissionAnswer;
  let (Some(origin), Some(host)) = (site::origin_of(uri), site::host_of(uri)) else { return PermissionAnswer::Deny };
  let browser = browser(app);
  match browser.permissions.lock().unwrap().get(&origin, permission) {
    Some(permissions::Decision::Allow) => return PermissionAnswer::Allow,
    Some(permissions::Decision::Deny) => return PermissionAnswer::Deny,
    None => {}
  }
  if *browser.shown.lock().unwrap() != Some(id) {
    return PermissionAnswer::Deny;
  }
  static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);
  let ask = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
  browser.asking.lock().unwrap().insert(ask, (id, origin, permission));
  emit_to_ui(app, &PermissionAsked { id: ask, tab_id: id, host, permission });
  PermissionAnswer::Ask(ask)
}

/// Answers Ezel's prompt `ask`: `Some(allow)` is remembered for the site; `None` (dismissed, the
/// tab changed) declines this once.
pub fn answer_permission(app: &AppHandle, ask: u32, allow: Option<bool>) -> Result<(), AppError> {
  let browser = browser(app);
  let Some((_, origin, permission)) = browser.asking.lock().unwrap().remove(&ask) else { return Ok(()) };
  if let Some(allow) = allow {
    let mut saved = browser.permissions.lock().unwrap();
    saved.set(&origin, permission, if allow { permissions::Decision::Allow } else { permissions::Decision::Deny });
    if permissions::save(&browser.data_dir, &saved).is_err() {
      log::error!("permissions: failed to save");
    }
  }
  #[cfg(windows)]
  app.run_on_main_thread(move || crate::webview2::answer_permission(ask, allow == Some(true)))?;
  Ok(())
}

/// Every remembered answer, by site.
pub fn site_permissions(app: &AppHandle) -> Vec<permissions::SitePermissions> {
  browser(app).permissions.lock().unwrap().list()
}

/// Forgets one remembered answer: the site asks again next time.
pub fn revoke_site_permission(app: &AppHandle, origin: &str, permission: permissions::SitePermission) -> Result<(), AppError> {
  let browser = browser(app);
  let mut saved = browser.permissions.lock().unwrap();
  if saved.revoke(origin, permission) {
    permissions::save(&browser.data_dir, &saved).map_err(|e| AppError::internal(format!("permissions: {}", e.kind())))?;
  }
  Ok(())
}

/// "Import from Zen", step 1: finds Zen's default profile, copies its session into Ezel's
/// `import` folder and reads it (`not_found`: no Zen; `unavailable`: close Zen first).
pub fn find_zen_import(app: &AppHandle) -> Result<zen_import::ZenImportPreview, AppError> {
  let zen_dir = app.path().data_dir().map_err(|e| AppError::internal(e.to_string()))?.join("zen");
  let profile = zen_import::find_profile(&zen_dir)?;
  let browser = browser(app);
  let data = zen_import::read_session(&profile, &browser.data_dir.join("import"))?;
  let preview = data.preview();
  *browser.zen.lock().unwrap() = Some(data);
  Ok(preview)
}

/// Step 2: imports the chosen Zen spaces (and the Essentials, if asked) into new spaces.
pub fn import_from_zen(app: &AppHandle, spaces: Vec<String>, essentials: bool) -> Result<zen_import::ImportSummary, AppError> {
  let plan = {
    let browser = browser(app);
    let zen = browser.zen.lock().unwrap();
    let data = zen.as_ref().ok_or_else(|| AppError::not_found("look for Zen's profile first"))?;
    data.plan(&spaces, essentials)?
  };
  let summary = update(app, |m, now| Ok((zen_import::apply(&plan, m, now)?, vec![])))?;
  *browser(app).zen.lock().unwrap() = None;
  Ok(summary)
}

/// A download began in any tab: it joins Ezel's list.
#[cfg(windows)]
fn download_started(app: &AppHandle, path: String, total: Option<u64>) -> u32 {
  let browser = browser(app);
  let mut list = browser.downloads.lock().unwrap();
  let id = list.start(std::path::PathBuf::from(path), total, now());
  emit_to_ui(app, &list.view());
  id
}

#[cfg(windows)]
fn download_event(app: &AppHandle, id: u32, event: crate::webview2::DownloadEvent) {
  use crate::webview2::DownloadEvent;
  let browser = browser(app);
  let mut list = browser.downloads.lock().unwrap();
  let changed = match event {
    DownloadEvent::Progress { received, total } => list.progress(id, received, total, now()),
    DownloadEvent::Ended { completed, cancelled, path } => {
      let state = match (completed, cancelled) {
        (true, _) => downloads::DownloadState::Completed,
        (false, true) => downloads::DownloadState::Cancelled,
        (false, false) => downloads::DownloadState::Failed,
      };
      list.finish(id, state, Some(path).filter(|p| !p.is_empty()).map(std::path::PathBuf::from))
    }
  };
  if changed {
    emit_to_ui(app, &list.view());
  }
}

/// A right-click in a tab's page: Ezel's menu opens at that point (the UI draws it and takes
/// focus for it). WebView2 waits until `choose_page_menu_item`.
#[cfg(windows)]
fn page_menu_requested(app: &AppHandle, id: Id, request: crate::webview2::MenuRequest) {
  let mut target = request.target;
  let selection = target.selection.as_deref().map(page_menu::preview);
  {
    let browser = browser(app);
    let model = browser.model.lock().unwrap();
    if let Some(live) = model.live.get(&id) {
      (target.can_go_back, target.can_go_forward) = (live.can_go_back, live.can_go_forward);
    }
  }
  let groups = page_menu::groups(&target, &request.native);
  let scale = app.get_window(crate::WINDOW_LABEL).and_then(|w| w.scale_factor().ok()).unwrap_or(1.0);
  let (left, top) = match content::current_bounds(app).position {
    tauri::Position::Logical(p) => (p.x, p.y),
    tauri::Position::Physical(p) => (p.x as f64 / scale, p.y as f64 / scale),
  };
  static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);
  let menu_id = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
  let menu = page_menu::PageMenu { id: menu_id, x: left + request.x as f64 / scale, y: top + request.y as f64 / scale, groups: groups.clone(), selection };
  *browser(app).menu.lock().unwrap() = Some(OpenMenu { id: menu_id, tab: id, target, groups });
  // The menu takes typing (arrows, Enter, Esc); the page gets focus back when it closes.
  if let Some(ui) = app.get_webview(crate::UI_LABEL) {
    let _ = ui.set_focus();
  }
  emit_to_ui(app, &menu);
}

/// A tab's page changed: record it, tell the UI about the tab, and about the page if it's shown.
/// `title: Some(None)` clears the title (a new navigation started); `loading: None` = unchanged.
fn on_page_event(webview: &Webview, id: Id, url: Option<String>, title: Option<Option<String>>, loading: Option<bool>) {
  let app = webview.app_handle();
  let layers = {
    let browser = browser(app);
    let mut model = browser.model.lock().unwrap();
    model.update_page(id, url, title);
    if let (Some(live), Some(loading)) = (model.live.get_mut(&id), loading) {
      live.is_loading = loading;
    }
    browser.store.save(&model.session);
    emit_tab(app, &model, id);
    model.live.get(&id).map(|l| l.layers.clone()).unwrap_or_default()
  };
  // A new tab's first document exists: show its webview (it was hidden until now).
  if loading == Some(true) {
    reveal(app, id);
  }
  // A new document (load started) or a finished one: its lenses go back on. The scripts are
  // idempotent; "started" is WebView2's ContentLoading, when the new document exists.
  if loading.is_some() {
    for layer in layers {
      let _ = webview.eval(layer.apply_script());
    }
  }
  publish_page(webview, id);
}

fn emit_tab(app: &AppHandle, model: &Model, id: Id) {
  if let Some(tab) = TabView::of(model, id) {
    emit_to_ui(app, &tab);
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
    security: site::security_of(&tab.url, live.cert_error),
    fullscreen: live.fullscreen,
    error: live.error,
  }
}

/// Whether a tab's webview may be on screen: its page has started rendering, and it isn't failed
/// (Ezel's error page shows in its place).
fn can_show(app: &AppHandle, id: Id) -> bool {
  let browser = browser(app);
  if browser.unpainted.lock().unwrap().contains(&id) {
    return false;
  }
  let failed = browser.model.lock().unwrap().live.get(&id).is_some_and(|l| l.error.is_some());
  !failed
}

/// A tab's page failed (or recovered, `None`): record it, hide or show its webview, tell the UI.
fn set_page_error(app: &AppHandle, id: Id, error: Option<site::PageError>) {
  {
    let browser = browser(app);
    let mut model = browser.model.lock().unwrap();
    let Some(live) = model.live.get_mut(&id) else { return };
    if live.error == error {
      return;
    }
    live.error = error;
    if error.is_some() {
      live.is_loading = false;
    }
  }
  if let Some(webview) = tab_webview(app, id) {
    if *browser(app).shown.lock().unwrap() == Some(id) {
      // After the WebView2 event that got us here has returned (no reentrant webview calls).
      let (a, w) = (app.clone(), webview.clone());
      let _ = app.run_on_main_thread(move || content::present(&w, can_show(&a, id)));
    }
    publish_page(&webview, id);
  }
}

/// The window is fullscreen exactly while the shown tab's page is (a video's fullscreen button);
/// leaving the tab, or the page leaving fullscreen, restores the window as it was.
fn apply_fullscreen(app: &AppHandle) {
  let full = {
    let browser = browser(app);
    let shown = *browser.shown.lock().unwrap();
    let model = browser.model.lock().unwrap();
    shown.and_then(|id| model.live.get(&id)).is_some_and(|l| l.fullscreen)
  };
  if let Some(window) = app.get_window(crate::WINDOW_LABEL) {
    if window.is_fullscreen().unwrap_or(false) != full {
      let _ = window.set_fullscreen(full);
    }
  }
}

/// True while the shown tab's page is in HTML fullscreen (Esc then leaves it).
pub fn shown_is_fullscreen(app: &AppHandle) -> bool {
  let browser = browser(app);
  let Some(id) = *browser.shown.lock().unwrap() else { return false };
  let full = browser.model.lock().unwrap().live.get(&id).is_some_and(|l| l.fullscreen);
  full
}

/// Esc in HTML fullscreen: the page leaves it (WebView2 doesn't do this itself).
pub fn exit_page_fullscreen(app: &AppHandle) {
  if let Some(webview) = shown_webview(app) {
    let _ = webview.eval("document.fullscreenElement&&document.exitFullscreen()");
  }
}

fn emit_page(app: &AppHandle, page: PageChanged) {
  emit_to_ui(app, &page);
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
      webview2::on_status_text(&pw, move |text| {
        if *browser(&a).shown.lock().unwrap() == Some(id) {
          emit_to_ui(&a, &LinkStatus { text: text.chars().take(MAX_STATUS).collect() });
        }
      });
      let a = app.clone();
      webview2::on_navigation_failed(&pw, move |error| {
        // A certificate problem reported for the page's own host counts as one, whatever the status.
        let cert = browser(&a).model.lock().unwrap().live.get(&id).is_some_and(|l| l.cert_error);
        set_page_error(&a, id, Some(if cert { site::PageError::Certificate } else { error }));
      });
      let a = app.clone();
      webview2::on_page_crashed(&pw, move || set_page_error(&a, id, Some(site::PageError::Crashed)));
      let a = app.clone();
      webview2::on_fullscreen_changed(&pw, move |full| {
        {
          let browser = browser(&a);
          let mut model = browser.model.lock().unwrap();
          if let Some(live) = model.live.get_mut(&id) {
            live.fullscreen = full;
          }
        }
        apply_fullscreen(&a);
        if let Some(webview) = tab_webview(&a, id) {
          publish_page(&webview, id);
        }
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
      let a = app.clone();
      webview2::on_certificate_error(&pw, move |request| certificate_error(&a, id, &request));
      let a = app.clone();
      webview2::on_context_menu(&pw, move |request| page_menu_requested(&a, id, request));
      let (a, b) = (app.clone(), app.clone());
      webview2::on_download_starting(&pw, move |path, total| download_started(&a, path, total), move |id, event| download_event(&b, id, event));
      let a = app.clone();
      webview2::on_find_changed(&pw, move |active, count| {
        if *browser(&a).shown.lock().unwrap() == Some(id) {
          emit_to_ui(&a, &FindChanged { active: active.max(0) as u32, count: count.max(0) as u32 });
        }
      });
      let a = app.clone();
      webview2::quiet_defaults(&pw, Some(Box::new(move |uri, kind| permission_requested(&a, id, &uri, kind))));
      webview2::forward_shortcuts(&pw, move |key| crate::hotkeys::handle(&app, key));
    });
  }

  // TODO: favicons, audio state and shortcut forwarding on macOS and Linux.
  #[cfg(not(windows))]
  let _ = (webview, id);
}
