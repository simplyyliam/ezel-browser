mod browser;
#[cfg(windows)]
mod clipboard;
mod content;
mod error;
mod hotkeys;
mod updater;
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
      get_memory,
      toggle_page_layer,
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
      set_tab_muted,
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
      updater::get_update_status,
      updater::install_update,
    ])
    .events(collect_events![
      browser::PageChanged,
      browser::TabsState,
      browser::TabView,
      hotkeys::HotkeyPressed,
      window_radius::WindowRadius,
      updater::UpdateStatus,
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

/// Chromium arguments of the one WebView2 environment every webview shares: the UI and every tab
/// must pass exactly these, or creating a webview fails. Two of wry's defaults (no Edge text-selection
/// mini menu, no Edge PDF UI: interface, not security), plus a quiet default: media may play sound
/// on its own only after the page got a click or key press (Chromium's
/// `document-user-activation-required`); muted autoplay still runs. WebView2 has no API setting for
/// autoplay, so this is the one place it can be set (Windows only).
///
/// wry also disables `msSmartScreenProtection` by default; Ezel doesn't: Microsoft Defender
/// SmartScreen checks the sites and downloads people open (docs/security-review.md). Never add it
/// back, and never turn off other security features here.
const BROWSER_ARGS: &str =
  "--disable-features=msWebOOUI,msPdfOOUI --autoplay-policy=document-user-activation-required";

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

/// The window frame's padding around the page, logical px (WindowFrame's `p-1.5`).
const FRAME_PADDING: f64 = 6.0;

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
    // Shown once it has the theme's background and the UI webview (below): no white first frame.
    .visible(false)
    .build()?;

  let ui = ui_bounds(&window)?;
  // Until the UI paints, WebView2 fills it with its default white: a white window at launch in
  // dark mode. Start from the theme's background instead (index.css --background: oklch(0.145 0 0)
  // dark, white light), like index.html does for the page itself.
  let background = match window.theme() {
    Ok(tauri::Theme::Dark) => tauri::window::Color(10, 10, 10, 255),
    _ => tauri::window::Color(255, 255, 255, 255),
  };
  let _ = window.set_background_color(Some(background));
  window.add_child(
    // The UI and every tab share a data directory, so they must use the same scrollbar style and
    // browser arguments. Autofill is profile-wide in WebView2: off here too (see browser::create_webview).
    WebviewBuilder::new(UI_LABEL, WebviewUrl::App("index.html".into()))
      .scroll_bar_style(SCROLL_BAR_STYLE)
      .additional_browser_args(BROWSER_ARGS)
      .general_autofill_enabled(false)
      .background_color(background),
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
  // Shown only now: showing grows the client area (by about a title bar) with a resize that the
  // handler above must hear, or the UI stays short of the window's bottom. Laid out again anyway.
  window.show()?;
  apply_layout(&window);
  // Where the page will go, before the UI reports it, so the restored tab's webview is created at
  // its real size: the frame's padding all round (WindowFrame's p-1.5), the sidebar collapsed.
  let size = window.inner_size()?.to_logical::<f64>(window.scale_factor()?);
  content::assume_bounds(
    window.app_handle(),
    FRAME_PADDING,
    FRAME_PADDING,
    size.width - 2.0 * FRAME_PADDING,
    size.height - 2.0 * FRAME_PADDING,
  );

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
    .manage(updater::Updates::default())
    // Its JS commands are never granted (no `updater:` permission): only Rust checks and installs.
    .plugin(tauri_plugin_updater::Builder::new().build())
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
      updater::start(app.handle());
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

  /// Websites run in the tab webviews and must never reach a command or event. Tauri's IPC lets a
  /// call through only when a capability matches BOTH the calling webview's label and its origin
  /// (`ipc/authority.rs`, `resolve_access`). These checks keep both gates shut for tabs:
  /// - the only capability is scoped to the `ui` webview by label, never to a window (the window
  ///   `main` also holds every tab) and never to remote origins (`remote` URLs);
  /// - tab webviews are labelled `tab-<id>`, so they can't be `ui`;
  /// - every command is in the app manifest (`build.rs`), so the ACL above applies to it at all.
  #[test]
  fn websites_in_tabs_cannot_reach_ipc() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities");
    let files: Vec<_> = std::fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name().into_string().unwrap()).collect();
    assert_eq!(files, vec!["default.json"], "a new capability file needs this review too");
    let cap: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(dir.join("default.json")).unwrap()).unwrap();
    assert_eq!(cap["webviews"], serde_json::json!([UI_LABEL]), "only the ui webview");
    assert!(cap.get("windows").is_none(), "a window-scoped capability would include every tab in it");
    assert!(cap.get("remote").is_none(), "no remote origins: website pages must not match");

    let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    assert!(conf["app"]["security"].get("capabilities").is_none(), "capabilities come from the reviewed folder only");

    assert!(browser::tab_label(1).starts_with("tab-") && browser::tab_label(1) != UI_LABEL);

    // Every command the UI can call (from the generated bindings) is declared in the app manifest.
    let manifest = include_str!("../build.rs");
    let bindings = std::fs::read_to_string(BINDINGS_PATH).unwrap();
    let invoked: Vec<&str> = bindings.split("__TAURI_INVOKE(\"").skip(1).map(|s| s.split('"').next().unwrap()).collect();
    assert!(!invoked.is_empty());
    for command in invoked {
      assert!(manifest.contains(&format!("\"{command}\"")), "{command} isn't in build.rs's app manifest");
    }
  }

  #[test]
  fn browser_args_keep_smartscreen_on_and_block_autoplay_with_sound() {
    // Overriding the arguments drops wry's own: keep its interface ones, never its SmartScreen one.
    assert!(BROWSER_ARGS.contains("--disable-features=msWebOOUI,msPdfOOUI"));
    assert!(!BROWSER_ARGS.to_ascii_lowercase().contains("smartscreen"), "SmartScreen must stay on");
    for security_feature in ["site-per-process", "disable-web-security", "IsolateOrigins", "no-sandbox"] {
      assert!(!BROWSER_ARGS.contains(security_feature), "{security_feature}");
    }
    assert!(BROWSER_ARGS.contains("--autoplay-policy=document-user-activation-required"));
  }

  /// Regenerates the real bindings file, then checks the contract is in it.
  #[test]
  fn export_bindings_regenerates_file_with_the_contract() {
    let path = Path::new(BINDINGS_PATH);
    export_bindings(&specta_builder(), path).unwrap();

    let ts = std::fs::read_to_string(path).unwrap();
    assert!(ts.starts_with(BINDINGS_HEADER));
    for command in ["navigate", "get_page", "hard_reload", "stop_loading", "open_devtools", "copy_page_url", "cycle_tab", "reopen_closed_tab", "set_tab_muted", "get_memory", "toggle_page_layer", "set_content_bounds", "get_window_radius", "get_tabs", "move_tab", "switch_space", "set_forwarded_hotkeys", "get_update_status", "install_update"] {
      assert!(ts.contains(&format!("\"{command}\"")), "{command} command missing");
    }
    for event in ["page-changed", "tabs-changed", "tab-updated", "hotkey-pressed", "window-radius-changed", "update-status"] {
      assert!(ts.contains(&format!("\"{event}\"")), "{event} event missing");
    }
    for ty in ["PageLayer", "MemoryReport", "TabMemory", "AppError", "ErrorCode", "Id", "Tab", "Folder", "Space", "SpaceItem", "Swatch", "TabsState", "TabLocation", "PageChanged", "WindowRadius", "UpdateStatus"] {
      assert!(ts.contains(&format!("export type {ty} =")), "{ty} type missing");
    }
  }
}
