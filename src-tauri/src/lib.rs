mod window_radius;

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

/// Last reported content size and corner radii, in logical px. Rust rebuilds the clip region from these.
#[derive(Default)]
struct ContentShape {
  width: f64,
  height: f64,
  /// CSS order: top-left, top-right, bottom-right, bottom-left.
  radii: [f64; 4],
}

/// Cached Windhawk settings (re-read only when the registry changes) and the last reported radius.
#[derive(Default)]
struct RadiusState {
  settings: window_radius::ModSettings,
  current: window_radius::WindowRadius,
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
  let (width, height) = (width.max(0.0), height.max(0.0));
  let webview = content(&app)?;
  webview
    .set_bounds(Rect {
      position: LogicalPosition::new(x, y).into(),
      size: LogicalSize::new(width, height).into(),
    })
    .map_err(|e| e.to_string())?;
  {
    let shape: State<Mutex<ContentShape>> = app.state();
    let mut shape = shape.lock().unwrap();
    shape.width = width;
    shape.height = height;
  }
  apply_content_shape(&webview);
  Ok(())
}

/// Rounds the content webview's corners. Logical px, CSS order: top-left, top-right, bottom-right, bottom-left.
#[tauri::command]
fn set_content_radius(app: AppHandle, radii: [f64; 4]) -> Result<(), String> {
  if !radii.iter().all(|r| r.is_finite() && *r >= 0.0) {
    return Err("radii must be finite, non-negative numbers".into());
  }
  {
    let shape: State<Mutex<ContentShape>> = app.state();
    shape.lock().unwrap().radii = radii;
  }
  apply_content_shape(&content(&app)?);
  Ok(())
}

/// Clips the content webview to its rounded shape. CSS can't do this: the webview is a native window above the UI.
fn apply_content_shape(webview: &Webview) {
  #[cfg(windows)]
  {
    let Ok(scale) = webview.window().scale_factor() else { return };
    let (width, height, radii) = {
      let shape: State<Mutex<ContentShape>> = webview.state();
      let s = shape.lock().unwrap();
      (s.width, s.height, s.radii)
    };
    let w = (width * scale).round() as i32;
    let h = (height * scale).round() as i32;
    let max = w.min(h) / 2;
    let radii = radii.map(|r| ((r * scale).round() as i32).clamp(0, max));

    let _ = webview.with_webview(move |pw| {
      use windows::Win32::{
        Foundation::HWND,
        Graphics::Gdi::{CombineRgn, CreateEllipticRgn, CreateRectRgn, DeleteObject, SetWindowRgn, RGN_DIFF, RGN_OR},
      };
      // SAFETY: called on the main thread with a live WebView2 controller. wry hosts each child
      // webview in its own container HWND (the controller's parent window); clipping it clips the page.
      unsafe {
        let mut hwnd = HWND::default();
        if pw.controller().ParentWindow(&mut hwnd).is_err() {
          return;
        }
        if radii.iter().all(|r| *r == 0) {
          SetWindowRgn(hwnd, None, true);
          return;
        }
        // Full rect, minus an r×r square at each rounded corner, plus a quarter ellipse back in each square.
        let region = CreateRectRgn(0, 0, w, h);
        let [tl, tr, br, bl] = radii;
        let corners = [
          (tl, 0, 0),
          (tr, w - tr, 0),
          (br, w - br, h - br),
          (bl, 0, h - bl),
        ];
        for (r, x, y) in corners {
          if r == 0 {
            continue;
          }
          let square = CreateRectRgn(x, y, x + r, y + r);
          CombineRgn(Some(region), Some(region), Some(square), RGN_DIFF);
          let _ = DeleteObject(square.into());
          // The ellipse's box is the 2r×2r square anchored in this corner.
          let ex = if x == 0 { 0 } else { w - 2 * r };
          let ey = if y == 0 { 0 } else { h - 2 * r };
          let ellipse = CreateEllipticRgn(ex, ey, ex + 2 * r + 1, ey + 2 * r + 1);
          CombineRgn(Some(region), Some(region), Some(ellipse), RGN_OR);
          let _ = DeleteObject(ellipse.into());
        }
        // The system owns the region from here on.
        SetWindowRgn(hwnd, Some(region), true);
      }
    });
  }

  // TODO: clip on macOS (layer cornerRadius) and Linux (WebKitGTK).
  #[cfg(not(windows))]
  let _ = webview;
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

#[tauri::command]
fn get_window_radius(state: State<Mutex<RadiusState>>) -> window_radius::WindowRadius {
  state.lock().unwrap().current
}

fn window_state(window: &Window) -> window_radius::WindowState {
  window_radius::WindowState {
    fullscreen: window.is_fullscreen().unwrap_or(false),
    maximized: window.is_maximized().unwrap_or(false),
    #[cfg(windows)]
    snapped: window.hwnd().map(window_radius::is_snapped).unwrap_or(false),
    #[cfg(not(windows))]
    snapped: false,
  }
}

/// Recomputes the effective radius; emits "window-radius-changed" to the UI only when it changes.
fn update_window_radius(window: &Window) {
  // Query the window before locking: from the watcher thread these calls wait on the main thread.
  let window_state = window_state(window);
  let state: State<Mutex<RadiusState>> = window.state();
  let mut s = state.lock().unwrap();
  // The radius model is Windows 11's; elsewhere report "unknown" and let the UI keep its defaults.
  let next = if cfg!(windows) {
    window_radius::effective_radius(s.settings, window_state)
  } else {
    window_radius::WindowRadius::default()
  };
  if next != s.current {
    s.current = next;
    let _ = window.emit_to(EventTarget::webview(UI_LABEL), "window-radius-changed", next);
  }
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
    // Maximize, restore, snap and fullscreen all arrive as resizes.
    if matches!(event, WindowEvent::Resized(_)) {
      update_window_radius(&w);
    }
    // Logical bounds don't change with DPI, so the frontend won't re-report them; rebuild the physical clip here.
    if matches!(event, WindowEvent::ScaleFactorChanged { .. }) {
      if let Some(content) = w.get_webview(CONTENT_LABEL) {
        apply_content_shape(&content);
      }
    }
  });

  {
    let state: State<Mutex<RadiusState>> = window.state();
    state.lock().unwrap().settings = window_radius::read_settings();
  }
  update_window_radius(&window);
  let w = window.clone();
  window_radius::watch(move || {
    {
      let state: State<Mutex<RadiusState>> = w.state();
      state.lock().unwrap().settings = window_radius::read_settings();
    }
    update_window_radius(&w);
  });

  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(Mutex::new(PageState::default()))
    .manage(Mutex::new(ContentShape::default()))
    .manage(Mutex::new(RadiusState::default()))
    .invoke_handler(tauri::generate_handler![
      navigate,
      get_page,
      go_back,
      go_forward,
      reload,
      set_content_bounds,
      set_content_visible,
      set_content_radius,
      get_window_radius
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
