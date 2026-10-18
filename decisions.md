# Decisions

## 2026-10-18: Engine
Tauri v2 system webview + unstable multi-webview, chosen for site compatibility and a light build; Servo considered for later.

## 2026-10-18: Layout ownership
Frontend owns content geometry (ContentSlot -> set_content_bounds). The titlebar peek is a React height animation; Rust just follows the reported bounds. Replaces "Rust owns the layout" and the 48px toolbar strip.

## 2026-10-18: Sidebar
Top grid named Swatches; sidebar built from docs/design/sidebar.png.

## 2026-10-18: Titlebar overlays the page via a webview cutout
Copies Zen's default peek: the page stays still and the bar covers its top. The website is a native webview above the UI, so the frontend reports the bar's rect (`set_content_cutout`) and Rust subtracts it from the webview's clip region. This replaces the push-down interim.

## 2026-10-18: Scrollbars
App scroll areas use a custom elastic pill thumb (`ScrollArea`); websites use WebView2 Fluent overlay scrollbars. Details: docs/design/decisions.md.

## 2026-10-18: Sidebar works like Zen's compact mode
Floating sidebar, collapsed by default; hovering the left edge peeks it over the page, Ctrl+B docks it. Follows Zen's "Only Sidebar" layout. The cutout command became keyed rounded rects (`set_content_cutout(id, rect, radius)`), so the titlebar and sidebar can each cut a hole in the website.
