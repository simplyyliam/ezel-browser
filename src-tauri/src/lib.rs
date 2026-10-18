use std::sync::Mutex;

use serde::Serialize;
use tauri::{
  webview::{PageLoadEvent, WebviewBuilder},
  window::WindowBuilder,
  AppHandle, Emitter, EventTarget, LogicalPosition, LogicalSize, Manager, Rect, State, Url,
  Webview, WebviewUrl, Window, WindowEvent,
};

/// Height of the UI (toolbar) webview, in logical px.
const TOOLBAR_HEIGHT: f64 = 48.0;
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
      let _ = app.emit_to(EventTarget::webview(UI_LABEL), "page-changed", payload);
    });
  }

  // TODO: read back/forward state on macOS (WKWebView) and Linux (WebKitGTK).
  #[cfg(not(windows))]
  let _ = app.emit_to(EventTarget::webview(UI_LABEL), "page-changed", payload);
}

/// Toolbar strip on top, content fills the rest. All values in logical px.
fn layout(window: &Window) -> tauri::Result<(Rect, Rect)> {
  let scale = window.scale_factor()?;
  let size = window.inner_size()?.to_logical::<f64>(scale);
  let toolbar_height = TOOLBAR_HEIGHT.min(size.height);
  let ui = Rect {
    position: LogicalPosition::new(0.0, 0.0).into(),
    size: LogicalSize::new(size.width, toolbar_height).into(),
  };
  let content = Rect {
    position: LogicalPosition::new(0.0, toolbar_height).into(),
    size: LogicalSize::new(size.width, size.height - toolbar_height).into(),
  };
  Ok((ui, content))
}

fn apply_layout(window: &Window) {
  let Ok((ui_bounds, content_bounds)) = layout(window) else { return };
  if let Some(ui) = window.get_webview(UI_LABEL) {
    let _ = ui.set_bounds(ui_bounds);
  }
  if let Some(content) = window.get_webview(CONTENT_LABEL) {
    let _ = content.set_bounds(content_bounds);
  }
}

fn build_window(app: &AppHandle) -> tauri::Result<()> {
  let window = WindowBuilder::new(app, WINDOW_LABEL)
    .title("Ezel")
    .inner_size(1280.0, 800.0)
    .min_inner_size(400.0, 300.0)
    .build()?;

  let (ui_bounds, content_bounds) = layout(&window)?;

  window.add_child(
    WebviewBuilder::new(UI_LABEL, WebviewUrl::App("index.html".into())),
    ui_bounds.position,
    ui_bounds.size,
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
  window.add_child(content, content_bounds.position, content_bounds.size)?;

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
    .invoke_handler(tauri::generate_handler![navigate, go_back, go_forward, reload])
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
