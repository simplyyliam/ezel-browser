fn main() {
  tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
    tauri_build::AppManifest::new().commands(&["navigate", "go_back", "go_forward", "reload"]),
  ))
  .expect("failed to run tauri-build");
}
