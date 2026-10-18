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

Only `ui` has IPC; `content` has none. Both use WebView2's Fluent overlay scrollbars (they share a data directory, so the style must match).

## Contract (UI ↔ Rust)
New commands must also be allow-listed in `src-tauri/build.rs` (app manifest) and `src-tauri/capabilities/default.json` (`allow-<name>`), otherwise every call is rejected silently.

Commands (`invoke`):
- `navigate(input: string)`: a URL is loaded (`https://` added if missing); anything else is searched on DuckDuckGo
- `go_back()`, `go_forward()`, `reload()`
- `get_page()`: returns the latest `page-changed` payload (same shape), so the UI can catch up on mount
- `set_content_bounds(x: number, y: number, width: number, height: number)`: places the content webview; logical px relative to the window's top-left
- `set_content_radius(radii: [number, number, number, number])`: clips the content webview to rounded corners; logical px, CSS order (top-left, top-right, bottom-right, bottom-left). Windows only for now.
- `set_content_cutout(id: string, rect: [x, y, width, height] | null, radius: number)`: cuts a window-relative rounded rect (logical px) out of the content webview's clip region under `id`, so the UI below shows through without moving or resizing the page. `rect: null` clears that id. Holes: `"titlebar"`, `"sidebar"`. Use `useContentCutout` (`shared/content-cutout.ts`), which follows an element every frame while it moves. Windows only for now.
- `set_content_visible(visible: boolean)`: shows or hides the content webview. It starts hidden, so report bounds first, then show it.
- `get_window_radius()` → `{ radius: number | null, customized: boolean }`: the corner radius Windows 11 actually draws for the window, logical px. Without the Windhawk "Custom Window Corner Radius" mod: 8, or 0 when fullscreen/maximized/snapped. With it (`customized: true`): the mod's radius, or 0 where it leaves windows square. `radius: null` = unknown (not Windows): keep the UI's default radii. The UI sets `--radius-frame` to `radius − 4` (frame padding).

Window APIs (`@tauri-apps/api/window`): `minimize`, `toggleMaximize`, `close`, `startDragging`, `isMaximized`, `isFullscreen`, `cursorPosition`, `innerPosition`, `innerSize`, `scaleFactor` (the last four let the titlebar peek follow the cursor above the window).

Event emitted to the `ui` webview:
- `page-changed`: `{ url: string, title: string | null, canGoBack: boolean, canGoForward: boolean, isLoading: boolean }`
  Emitted on navigation start, on page load finish, and when the document title changes.
- `toggle-sidebar`: no payload. Ctrl+B was pressed while the website had focus. Rust catches it on the content webview (WebView2 `AcceleratorKeyPressed`) because those keys never reach the `ui` webview; the page doesn't receive it. Windows only for now.
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
  - `widgets/app-titlebar` composes `features/app-titlebar/window-controls`. It's a Zen-style peek (studied from Zen's source, see `docs/design/decisions.md`): it overlays the top of the window, opens from a 4px strip at the top edge, grows its height over 150ms ease-in-out and never moves the page. The website is a native webview above the UI, so the bar is cut out of it with `useContentCutout` and Rust cuts it out of the page. No shadow. It holds only the window controls.
  - `widgets/browser-view` composes `features/browser-view/content-slot` (the placeholder the content webview is placed over)
  - `widgets/app-sidebar` composes `features/app-sidebar/*` (see Sidebar below)

## Sidebar
Built from `docs/design/sidebar-1.png` (a 1.5x export) with shadcn's `Sidebar` (`collapsible="offcanvas"`, collapsed by default). The variant follows the state: docked (open) uses `variant="sidebar"` (flat: no padding, radius, ring, shadow or divider), collapsed/peeking uses `variant="floating"` (Zen's card).
- Behaves like Zen's compact mode in its "Only Sidebar" layout (studied from Zen's source, see `docs/design/decisions.md`, "Sidebar peek"). **Collapsed**: the page is full width; hovering the window's left edge (the frame's 4px padding) peeks the card out over the page: in 0.25s on Zen's spring curve (`ease-zen-peek`), out 0.15s ease. It stays while hovered, focused or showing a menu, 150ms after the pointer leaves, and while the pointer is within 200px left of the window. **Open** (Ctrl+B / `SidebarTrigger`): docked beside the page. Logic: `widgets/app-sidebar/use-sidebar-peek.ts`. The card (plus its 1px ring) is cut out of the website so it shows above it; the floating shadow is clipped over the page.
- Layout: `AppLayout` = `SidebarProvider` > `WindowFrame` (titlebar on top) > row (`relative`) > `AppSidebar` + `SidebarInset` > `<Outlet />`. The provider wraps the frame so the titlebar can use `useSidebar`. The browser page renders only the `BrowserView` (ContentSlot).
- Positioning: the sidebar is `absolute h-full` against the row below the titlebar, not shadcn's viewport-fixed default (overridden through `className`).
- **shadcn components in `components/ui/` stay at registry defaults. Never edit them**; customise at the call site with `className`/`render`. Build sidebar UI from its primitives (`SidebarGroup`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarMenuSub*`, `SidebarInput`, `SidebarSeparator`, `SidebarTrigger`) instead of raw buttons.
- Width: `SIDEBAR_WIDTH` (244px) in `widgets/app-sidebar`, set via `--sidebar-width`; groups keep shadcn's `p-2` and the swatch grid is 4 fluid columns. The design image is scaled up for legibility; sizes are in `docs/design/decisions.md` (Sizing).
- Padding/corners: docked, the frame's `p-1` is the only gap around the sidebar. The peeking card keeps shadcn's floating `p-2` (Zen's 8px float margin) and radius. The inset sits flush in the frame, so it and the ContentSlot use `rounded-frame`.
- Toggle: **Ctrl+B** from anywhere: shadcn's shortcut while the UI has focus, and the `toggle-sidebar` event (forwarded by Rust) while the website has it. Or shadcn's `SidebarTrigger` in the sidebar header. The ContentSlot's ResizeObserver re-measures every frame of the collapse/expand transition, so the website follows.
- Features (`features/app-sidebar/`): `navigation`, `url-bar` (temporary block at the top, removed when the command palette lands), `swatches`, `space-switcher`, `folders`, `temp-tabs`, `bottom-actions`. All mock data lives in `features/app-sidebar/placeholder-data.ts`; the widget passes it down as props.
- Scrolling: the sidebar body uses `ScrollArea` (`shared/components/scroll-area`): native scrolling with a trackless, auto-hiding, elastic pill thumb. Use it for any scrollable app UI.
- Shared: `shared/components/{tab-row,favicon,scroll-area}` (`TabRow` is a `SidebarMenuButton`), `shared/types` (`Tab`, `Folder`, `SpaceItem`, `Space`, `Swatch`), `shared/motion.ts` (`PEEK_TRANSITION` = the titlebar peek's 150ms ease-in-out; use `INSTANT` under `useReducedMotion`).
- **No overlap past the right edge**: the native website webview is drawn on top of the UI, so tooltips, popovers and menus must never extend past the sidebar's right edge or they are hidden. Pick `side`/`align` to keep them inside (e.g. the add menu uses `side="top" align="end"`).

### Rules for the tabs step (documentation only, not implemented yet)
- The top grid is called **Swatches** (max 8).
- Temp tabs and pinned tabs both survive an app restart.
- Closing a temp tab removes it immediately.
- Closing a pinned tab only unloads the site; the pinned tab stays in its space and can be reopened.
- Trash-all clears temp tabs only.

## Design
Read `docs/design/decisions.md` before UI work: motion language, the titlebar peek study, the scrollbar spec and the sizing scale.

## Current scope
MVP only. Sidebar shell with placeholder data; no real tabs, folders, spaces, downloads or persistence.
