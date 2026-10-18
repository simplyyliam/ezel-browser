# Ezel

A lightweight browser for designers.

## Stack
- Tauri v2 (Rust) with the `unstable` feature for multi-webview, using the system webview
- UI: React + Vite + shadcn + Tailwind v4 (`src/`)
- Rust side: `src-tauri/`

## Run
`npm run tauri dev`

## Architecture
Rust owns the layout; UI only sends commands and listens to events.

One window (`main`), two webviews:
- `ui`: the React app, a toolbar strip at the top, `TOOLBAR_HEIGHT` = 48 logical px
- `content`: the website, fills the rest of the window; starts at https://duckduckgo.com

Rust recomputes both webviews' bounds on window resize. Only `ui` has IPC; `content` has none.

## Contract (UI ↔ Rust)
Commands (`invoke`):
- `navigate(input: string)`: a URL is loaded (`https://` added if missing); anything else is searched on DuckDuckGo
- `go_back()`, `go_forward()`, `reload()`
- `get_page()`: returns the latest `page-changed` payload (same shape), so the UI can catch up on mount

Event emitted to the `ui` webview:
- `page-changed`: `{ url: string, title: string | null, canGoBack: boolean, canGoForward: boolean, isLoading: boolean }`
  Emitted on navigation start, on page load finish, and when the document title changes.

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
- Current widget: `widgets/toolbar` composes `features/toolbar/{navigation,url-bar,loading-indicator}`.

## Current scope
MVP only. No tabs, no sidebar, no persistence.
