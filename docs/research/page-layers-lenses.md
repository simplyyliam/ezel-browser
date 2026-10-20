# Page layers and lenses (2026-10-20)

Used for: Squint and Greyscale (`browser/layers.rs`, `toggle_page_layer`). Later: Loupe, Palette Pull, Wireframe and colour-blind lenses reuse the inject path (CLAUDE.md, "Page layers").

## Findings
- **Where to draw.** Tab pages are native child webviews above the UI, so lens effects can't be drawn by React over them. They have to live in the page (vision doc, technical notes: "injected into the page").
- **When to re-inject.** WebView2's `ContentLoading` fires when a navigation's new document exists, before its content loads; Tauri's `PageLoadEvent::Started` is that event on Windows (wry 0.57). Running an idempotent script there, and again at `NavigationCompleted`, keeps a layer through navigations without tracking `AddScriptToExecuteOnDocumentCreated` ids. Same-document navigations (pushState, #hash) keep the existing `<style>`.
- **At `ContentLoading`, `<html>` may not exist yet**, so the script waits for it with a `MutationObserver` on `document`.
- **Stacking filters.** Two rules each setting `filter` on `html` override each other. Composing custom properties (`filter: var(--a,) var(--b,)`) stacks them, and an empty fallback keeps the declaration valid when only one is set.
- **Squint test**: blur the design until text turns into shapes, so only hierarchy, contrast and grouping are left. 5px blur on a page at normal distance does that. Greyscale: `grayscale(1)` checks a design without colour (vision 3.5).
- **Key choice.** Ctrl+Alt+letter is AltGr+letter on many European layouts (e.g. Polish AltGr+S types "ś"), so these lens keys can swallow a character there. They stay rebindable in `HOTKEYS` (Settings later).

## Sources
- ICoreWebView2 events (`ContentLoading`, `ExecuteScript`, `AddScriptToExecuteOnDocumentCreated`): https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2
- wry 0.57 `webview2/mod.rs` (page-load events mapping), read from source.
- CSS `filter`: https://developer.mozilla.org/en-US/docs/Web/CSS/filter
- Custom property fallbacks (`var()`): https://developer.mozilla.org/en-US/docs/Web/CSS/var
- AltGr equals Ctrl+Alt on Windows: https://en.wikipedia.org/wiki/AltGr_key
- Ezel vision, sections 3.5 (lenses) and 9 (overlays): `docs/Ezel-Product-Vision.md`
