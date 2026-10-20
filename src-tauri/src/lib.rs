mod browser;
#[cfg(windows)]
mod clipboard;
mod content;
mod error;
mod hotkeys;
#[cfg(windows)]
mod webview2;
mod window_radius;

use std::{path::Path, sync::Mutex};

use serde::Serialize;
use specta_typescript::Typescript;
use tauri::{
  webview::{ScrollBarStyle, WebviewBuilder},
  window::WindowBuilder,
  AppHandle, Emitter, EventTarget, LogicalPosition, LogicalSize, Manager, Rect, RunEvent, Runtime, State,
  WebviewUrl, Window, WindowEvent,
};
use tauri_specta::{collect_commands, collect_events};

use error::AppError;

const WINDOW_LABEL: &str = "main";
const UI_LABEL: &str = "ui";

/// Where the generated TypeScript bindings live. Never hand-edit that file.
pub const BINDINGS_PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../src/shared/bindings.ts");

const BINDINGS_HEADER: &str = "// Regenerate from src-tauri with a debug run or `cargo test`.";

/// Every command and event in the contract. Register new ones here.
pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
  use browser::commands::*;
  use content::*;
  use hotkeys::*;

  tauri_specta::Builder::<tauri::Wry>::new()
    .commands(collect_commands![
      navigate,
      get_page,
      go_back,
      go_forward,
      reload,
      hard_reload,
      stop_loading,
      open_devtools,
      copy_page_url,
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
      reopen_closed_tab,
      unload_tab,
      cycle_tab,
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
      set_forwarded_hotkeys,
    ])
    .events(collect_events![
      browser::PageChanged,
      browser::TabsState,
      browser::TabView,
      hotkeys::HotkeyPressed,
      window_radius::WindowRadius,
    ])
}

pub fn export_bindings(builder: &tauri_specta::Builder<tauri::Wry>, path: &Path) -> Result<(), AppError> {
  builder
    .export(Typescript::default().header(BINDINGS_HEADER), path)
    .map_err(|err| AppError::internal(format!("failed to export bindings: {err}")))
}

/// Emits a typed event to the `ui` webview (the only one with IPC). Failures are ignored: a missed
/// update is re-sent with the next change. The event must be registered with `collect_events!`.
fn emit_to_ui<R: Runtime, H: Emitter<R> + Manager<R>, E: tauri_specta::Event + Serialize + Clone>(handle: &H, event: &E) {
  let _ = event.emit_to(handle, EventTarget::webview(UI_LABEL));
}

/// Thin overlay scrollbars that auto-hide and have no track (WebView2 125+; ignored elsewhere).
const SCROLL_BAR_STYLE: ScrollBarStyle = ScrollBarStyle::FluentOverlay;

/// Cached Windhawk settings (re-read only when the registry changes) and the last reported radius.
#[derive(Default)]
struct RadiusState {
  settings: window_radius::ModSettings,
  current: window_radius::WindowRadius,
}

#[tauri::command]
#[specta::specta]
fn get_window_radius(state: State<Mutex<RadiusState>>) -> Result<window_radius::WindowRadius, AppError> {
  Ok(state.lock().unwrap().current)
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
    emit_to_ui(window, &next);
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
  let specta = specta_builder();
  #[cfg(debug_assertions)]
  if let Err(err) = export_bindings(&specta, Path::new(BINDINGS_PATH)) {
    log::error!("bindings export failed: {err}");
  }

  tauri::Builder::default()
    .manage(Mutex::new(content::ContentShape::default()))
    .manage(Mutex::new(RadiusState::default()))
    .manage(hotkeys::ForwardedHotkeys::default())
    .invoke_handler(specta.invoke_handler())
    .setup(move |app| {
      // Before anything emits: typed events look their name up in what this registers.
      specta.mount_events(app);
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

#[cfg(test)]
mod tests {
  use super::*;

  /// Regenerates the real bindings file, then checks the contract is in it.
  #[test]
  fn export_bindings_regenerates_file_with_the_contract() {
    let path = Path::new(BINDINGS_PATH);
    export_bindings(&specta_builder(), path).unwrap();

    let ts = std::fs::read_to_string(path).unwrap();
    assert!(ts.starts_with(BINDINGS_HEADER));
    for command in ["navigate", "get_page", "hard_reload", "stop_loading", "open_devtools", "copy_page_url", "cycle_tab", "reopen_closed_tab", "set_content_bounds", "get_window_radius", "get_tabs", "move_tab", "switch_space", "set_forwarded_hotkeys"] {
      assert!(ts.contains(&format!("\"{command}\"")), "{command} command missing");
    }
    for event in ["page-changed", "tabs-changed", "tab-updated", "hotkey-pressed", "window-radius-changed"] {
      assert!(ts.contains(&format!("\"{event}\"")), "{event} event missing");
    }
    for ty in ["AppError", "ErrorCode", "Id", "Tab", "Folder", "Space", "SpaceItem", "Swatch", "TabsState", "TabLocation", "PageChanged", "WindowRadius"] {
      assert!(ts.contains(&format!("export type {ty} =")), "{ty} type missing");
    }
  }
}
