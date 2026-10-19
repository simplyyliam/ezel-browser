mod browser;
mod content;
#[cfg(windows)]
mod webview2;
mod window_radius;

use std::sync::Mutex;

use tauri::{
  webview::{ScrollBarStyle, WebviewBuilder},
  window::WindowBuilder,
  AppHandle, Emitter, EventTarget, LogicalPosition, LogicalSize, Manager, Rect, RunEvent, State, WebviewUrl,
  Window, WindowEvent,
};

const WINDOW_LABEL: &str = "main";
const UI_LABEL: &str = "ui";

/// Thin overlay scrollbars that auto-hide and have no track (WebView2 125+; ignored elsewhere).
const SCROLL_BAR_STYLE: ScrollBarStyle = ScrollBarStyle::FluentOverlay;

/// Cached Windhawk settings (re-read only when the registry changes) and the last reported radius.
#[derive(Default)]
struct RadiusState {
  settings: window_radius::ModSettings,
  current: window_radius::WindowRadius,
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

/// The UI webview covers the whole window (logical px). Tab webviews are placed by the frontend.
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
    // The UI and every tab share a data directory, so they must use the same scrollbar style.
    WebviewBuilder::new(UI_LABEL, WebviewUrl::App("index.html".into())).scroll_bar_style(SCROLL_BAR_STYLE),
    ui.position,
    ui.size,
  )?;

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
      content::reapply_shape(w.app_handle());
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
  use browser::commands::*;
  use content::*;

  tauri::Builder::default()
    .manage(Mutex::new(content::ContentShape::default()))
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
      set_content_cutout,
      get_window_radius,
      get_tabs,
      open_tab,
      activate_tab,
      close_tab,
      remove_tab,
      unload_tab,
      move_tab,
      reset_tab,
      update_pinned_url,
      clear_temp_tabs,
      create_folder,
      rename_folder,
      set_folder_collapsed,
      move_folder,
      delete_folder,
      unload_folder,
      create_space,
      update_space,
      move_space,
      delete_space,
      switch_space,
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
      // Restores the saved tabs and shows the active one (hidden until the frontend reports bounds).
      browser::init(app.handle())?;
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      if let RunEvent::Exit = event {
        browser::flush(app);
      }
    });
}
