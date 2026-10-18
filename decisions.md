# Decisions

## 2026-10-18: Engine
Tauri v2 system webview + unstable multi-webview, chosen for site compatibility and a light build; Servo considered for later.

## 2026-10-18: Layout ownership
Frontend owns content geometry (ContentSlot -> set_content_bounds). The titlebar peek is a React height animation; Rust just follows the reported bounds. Replaces "Rust owns the layout" and the 48px toolbar strip.

## 2026-10-18: Sidebar
Top grid named Swatches; sidebar built from docs/design/sidebar.png.
