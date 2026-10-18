fn main() {
  tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
    tauri_build::AppManifest::new().commands(&[
      "navigate",
      "get_page",
      "go_back",
      "go_forward",
      "reload",
      "set_content_bounds",
      "set_content_visible",
    ]),
  ))
  .expect("failed to run tauri-build");
}
