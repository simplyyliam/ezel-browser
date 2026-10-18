use std::sync::Mutex;

use serde::Serialize;
use tauri::{
  webview::{PageLoadEvent, WebviewBuilder},
  window::WindowBuilder,
  AppHandle, Emitter, EventTarget, LogicalPosition, LogicalSize, Manager, Rect, State, Url,
  Webview, WebviewUrl, Window, WindowEvent,
};

const HOME_URL: &str = "https://duckduckgo.com";
const SEARCH_URL: &str = "https://duckduckgo.com/";

const WINDOW_LABEL: &str = "main";
const UI_LABEL: &str = "ui";
const CONTENT_LABEL: &str = "content";

/// What we know about the current page that the webview can't tell us on demand.
#[derive(Default)]
struct PageState {
  title: Option<String>,
  is_loading: bool,
  /// Last payload emitted as "page-changed", returned by `get_page`.
  last: Option<PageChanged>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PageChanged {
  url: String,
  title: Option<String>,
  can_go_back: bool,
  can_go_forward: bool,
  is_loading: bool,
}

fn content(app: &AppHandle) -> Result<Webview, String> {
  app
    .get_webview(CONTENT_LABEL)
    .ok_or_else(|| "content webview not found".into())
}

/// Turns address-bar input into a URL: a URL as-is (https:// added if missing), anything else a DuckDuckGo search.
fn resolve_input(input: &str) -> Result<Url, String> {
  let input = input.trim();
  let has_scheme = ["http://", "https://", "about:", "file://"]
    .iter()
    .any(|s| input.to_ascii_lowercase().starts_with(s));
  if has_scheme {
    return Url::parse(input).map_err(|e| e.to_string());
  }

  let host = input.split(['/', '?', '#']).next().unwrap_or("");
  let looks_like_host = !input.contains(char::is_whitespace)
    && (host.contains('.') || host == "localhost" || host.starts_with("localhost:"));
  if looks_like_host {
    if let Ok(url) = Url::parse(&format!("https://{input}")) {
      return Ok(url);
    }
  }

  Url::parse_with_params(SEARCH_URL, &[("q", input)]).map_err(|e| e.to_string())
}

#[tauri::command]
fn navigate(app: AppHandle, input: String) -> Result<(), String> {
  let url = resolve_input(&input)?;
  content(&app)?.navigate(url).map_err(|e| e.to_string())
}

/// Latest page state, so the UI can catch up on events emitted before it started listening.
#[tauri::command]
fn get_page(app: AppHandle, state: State<Mutex<PageState>>) -> PageChanged {
  let s = state.lock().unwrap();
  if let Some(last) = &s.last {
    return last.clone();
  }
  let url = content(&app).ok().and_then(|w| w.url().ok()).map(|u| u.to_string()).unwrap_or_default();
  PageChanged { url, title: s.title.clone(), can_go_back: false, can_go_forward: false, is_loading: s.is_loading }
}

#[tauri::command]
fn go_back(app: AppHandle) -> Result<(), String> {
  content(&app)?.eval("history.back()").map_err(|e| e.to_string())
}

#[tauri::command]
fn go_forward(app: AppHandle) -> Result<(), String> {
  content(&app)?.eval("history.forward()").map_err(|e| e.to_string())
}

#[tauri::command]
fn reload(app: AppHandle) -> Result<(), String> {
  content(&app)?.reload().map_err(|e| e.to_string())
}

/// Places the content webview. Logical px, relative to the window's top-left. Reported by the frontend.
#[tauri::command]
fn set_content_bounds(app: AppHandle, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
  if ![x, y, width, height].iter().all(|v| v.is_finite()) {
    return Err("bounds must be finite numbers".into());
  }
  content(&app)?
    .set_bounds(Rect {
      position: LogicalPosition::new(x, y).into(),
      size: LogicalSize::new(width.max(0.0), height.max(0.0)).into(),
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_content_visible(app: AppHandle, visible: bool) -> Result<(), String> {
  let webview = content(&app)?;
  if visible { webview.show() } else { webview.hide() }.map_err(|e| e.to_string())
}

/// Emits "page-changed" to the UI webview. Back/forward state comes from the native webview.
fn emit_page_changed(webview: &Webview, url: String) {
  let app = webview.app_handle().clone();
  let state: State<Mutex<PageState>> = app.state();
  let (title, is_loading) = {
    let s = state.lock().unwrap();
    (s.title.clone(), s.is_loading)
  };
  let mut payload = PageChanged { url, title, can_go_back: false, can_go_forward: false, is_loading };

  #[cfg(windows)]
  {
    let _ = webview.with_webview(move |pw| {
      // SAFETY: called on the main thread with a live WebView2 controller.
      unsafe {
        if let Ok(core) = pw.controller().CoreWebView2() {
          let (mut back, mut forward) = (Default::default(), Default::default());
          if core.CanGoBack(&mut back).is_ok() {
            payload.can_go_back = back.as_bool();
          }
          if core.CanGoForward(&mut forward).is_ok() {
            payload.can_go_forward = forward.as_bool();
          }
        }
      }
      publish(&app, payload);
    });
  }

  // TODO: read back/forward state on macOS (WKWebView) and Linux (WebKitGTK).
  #[cfg(not(windows))]
  publish(&app, payload);
}

/// Stores the payload as the latest page state, then emits it to the UI webview.
fn publish(app: &AppHandle, payload: PageChanged) {
  let state: State<Mutex<PageState>> = app.state();
  state.lock().unwrap().last = Some(payload.clone());
  let _ = app.emit_to(EventTarget::webview(UI_LABEL), "page-changed", payload);
}

/// The UI webview covers the whole window (logical px). The content webview is placed by the frontend.
fn ui_bounds(window: &Window) -> tauri::Result<Rect> {
  let size = window.inner_size()?.to_logical::<f64>(window.scale_factor()?);
  Ok(Rect {
    position: LogicalPosition::new(0.0, 0.0).into(),
    size: LogicalSize::new(size.width, size.height).into(),
  })
}

fn apply_layout(window: &Window) {
  let Ok(bounds) = ui_bounds(window) else { return };
  if let Some(ui) = window.get_webview(UI_LABEL) {
    let _ = ui.set_bounds(bounds);
  }
}

fn build_window(app: &AppHandle) -> tauri::Result<()> {
  let window = WindowBuilder::new(app, WINDOW_LABEL)
    .title("Ezel")
    .inner_size(1280.0, 800.0)
    .min_inner_size(400.0, 300.0)
    .decorations(false)
    .build()?;

  let ui = ui_bounds(&window)?;
  window.add_child(
    WebviewBuilder::new(UI_LABEL, WebviewUrl::App("index.html".into())),
    ui.position,
    ui.size,
  )?;

  let content = WebviewBuilder::new(CONTENT_LABEL, WebviewUrl::External(HOME_URL.parse().unwrap()))
    .on_page_load(|webview, payload| {
      let started = matches!(payload.event(), PageLoadEvent::Started);
      {
        let state: State<Mutex<PageState>> = webview.state();
        let mut s = state.lock().unwrap();
        s.is_loading = started;
        if started {
          s.title = None;
        }
      }
      emit_page_changed(&webview, payload.url().to_string());
    })
    .on_document_title_changed(|webview, title| {
      {
        let state: State<Mutex<PageState>> = webview.state();
        state.lock().unwrap().title = Some(title).filter(|t| !t.is_empty());
      }
      let url = webview.url().map(|u| u.to_string()).unwrap_or_default();
      emit_page_changed(&webview, url);
    });
  // Starts zero-sized and hidden; it appears only once the frontend reports bounds and calls set_content_visible(true).
  window
    .add_child(content, LogicalPosition::new(0.0, 0.0), LogicalSize::new(0.0, 0.0))?
    .hide()?;

  let w = window.clone();
  window.on_window_event(move |event| {
    if matches!(event, WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. }) {
      apply_layout(&w);
    }
  });

  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(Mutex::new(PageState::default()))
    .invoke_handler(tauri::generate_handler![
      navigate,
      get_page,
      go_back,
      go_forward,
      reload,
      set_content_bounds,
      set_content_visible
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      build_window(app.handle())?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
