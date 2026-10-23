fn main() {
  let mut attributes = tauri_build::Attributes::new();

  // On Windows MSVC the app manifest (Common Controls v6) is embedded via linker args instead of
  // tauri-build's resource file, so that test executables get it too (same as Foundry). Without
  // it, `cargo test` exits with STATUS_ENTRYPOINT_NOT_FOUND.
  let windows_msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
    && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
  if windows_msvc {
    attributes = attributes.windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    println!("cargo:rustc-link-arg=/WX");
  }

  tauri_build::try_build(attributes.app_manifest(
    tauri_build::AppManifest::new().commands(&[
      "navigate",
      "get_page",
      "choose_page_menu_item",
      "go_back",
      "go_forward",
      "reload",
      "reload_tab",
      "hard_reload",
      "stop_loading",
      "open_devtools",
      "copy_page_url",
      "clear_site_data",
      "get_memory",
      "toggle_page_layer",
      "set_content_bounds",
      "set_content_visible",
      "set_content_radius",
      "set_content_cutout",
      "get_window_radius",
      "get_tabs",
      "open_tab",
      "activate_tab",
      "close_tab",
      "remove_tab",
      "reopen_closed_tab",
      "unload_tab",
      "cycle_tab",
      "set_tab_muted",
      "move_tab",
      "reset_tab",
      "update_pinned_url",
      "clear_temp_tabs",
      "create_folder",
      "create_folder_with_tab",
      "rename_folder",
      "set_folder_collapsed",
      "move_folder",
      "delete_folder",
      "unload_folder",
      "create_space",
      "update_space",
      "move_space",
      "delete_space",
      "switch_space",
      "set_forwarded_hotkeys",
      "get_update_status",
      "install_update",
    ]),
  ))
  .expect("failed to run tauri-build");
}
