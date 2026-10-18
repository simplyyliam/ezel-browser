# Ezel

A lightweight browser for designers.

## Stack
- Tauri v2 (Rust) with the `unstable` feature for multi-webview, using the system webview
- UI: React + Vite + shadcn + Tailwind v4 (`src/`)
- Rust side: `src-tauri/`

## Run
`npm run tauri dev`

## Architecture
The frontend owns content geometry; Rust follows the reported bounds. The UI only sends commands and listens to events.

One frameless window (`main`, `decorations(false)`), two webviews:
- `ui`: the React app, covers the whole window (Rust re-applies full-window bounds on every resize). It draws its own titlebar, window controls and drag region.
- `content`: the website, placed wherever the frontend reports via `set_content_bounds`; starts at https://duckduckgo.com, hidden until `set_content_visible(true)`.

Only `ui` has IPC; `content` has none.

## Contract (UI ↔ Rust)
Commands (`invoke`):
- `navigate(input: string)`: a URL is loaded (`https://` added if missing); anything else is searched on DuckDuckGo
- `go_back()`, `go_forward()`, `reload()`
- `get_page()`: returns the latest `page-changed` payload (same shape), so the UI can catch up on mount
- `set_content_bounds(x: number, y: number, width: number, height: number)`: places the content webview; logical px relative to the window's top-left
- `set_content_radius(radii: [number, number, number, number])`: clips the content webview to rounded corners; logical px, CSS order (top-left, top-right, bottom-right, bottom-left). Windows only for now.
- `set_content_visible(visible: boolean)`: shows or hides the content webview. It starts hidden, so report bounds first, then show it.
- `get_window_radius()` → `{ radius: number | null, customized: boolean }`: the corner radius Windows 11 actually draws for the window, logical px. Without the Windhawk "Custom Window Corner Radius" mod: 8, or 0 when fullscreen/maximized/snapped. With it (`customized: true`): the mod's radius, or 0 where it leaves windows square. `radius: null` = unknown (not Windows): keep the UI's default radii. The UI sets `--radius-frame` to `radius − 4` (frame padding).

Window APIs (`@tauri-apps/api/window`): `minimize`, `toggleMaximize`, `close`, `startDragging`, `isMaximized`, `isFullscreen`, `cursorPosition`, `innerPosition`, `innerSize`, `scaleFactor` (the last four let the titlebar peek follow the cursor above the window).

Event emitted to the `ui` webview:
- `page-changed`: `{ url: string, title: string | null, canGoBack: boolean, canGoForward: boolean, isLoading: boolean }`
  Emitted on navigation start, on page load finish, and when the document title changes.
- `window-radius-changed`: same payload as `get_window_radius`. Emitted only when the value changes (window resize/maximize/snap/fullscreen, or the mod's registry settings change).

## Frontend structure
```
src/
  widgets/<widget>/              parent: lays out and composes its features
  features/<widget>/<feature>/   features belong to the widget folder with the EXACT same name
  shared/                        Tauri invoke/listen helpers, contract types (PageChanged)
  components/ui/                 shadcn components
```
- Features never import from widgets or from other features. Code two features need goes in `shared/`.
- Widgets may import from their own features and from `shared/`.
- Current widgets:
  - `widgets/app-titlebar` composes `features/app-titlebar/window-controls`. It's a Zen-style peek: it overlays the top of the window (never moves the content) and opens from a 4px strip at the top edge.
  - `widgets/browser-view` composes `features/browser-view/content-slot` (the placeholder the content webview is placed over)
  - `widgets/toolbar` composes `features/toolbar/{navigation,url-bar,loading-indicator}` (temporary, until sidebar + command palette)

## Current scope
MVP only. No tabs, no sidebar, no persistence.
