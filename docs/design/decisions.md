# Design decisions

Small UX and design-engineering calls, with the reasoning, so later work stays consistent.
Project-level decisions live in `/decisions.md`.

## Principles
- **Calm by default.** Chrome (scrollbars, the titlebar) stays out of sight until it's needed, then gets out of the way again.
- **One motion language.** UI transitions use the titlebar peek's timing: 150ms ease-in-out (`PEEK_TRANSITION` in `src/shared/motion.ts`). Physical feedback (things that follow the user's input, like scroll stretch) uses springs instead.
- **Fast in, slower out.** Things appear quickly (about 120ms) so they feel responsive, and leave more slowly (about 300ms) so they don't flicker.
- **Reduced motion is respected.** With `prefers-reduced-motion`, nothing moves or stretches. State changes apply instantly; plain opacity fades are fine.
- **No shadows on window chrome.** The titlebar and sidebar sit flat on the frame.
- **Nothing floats past the sidebar's right edge.** The native website webview is drawn over all UI.

## Titlebar peek (2026-10-18)
Studied Zen's source (`src/zen/compact-mode/toolbar.inc.css`, `src/zen/common/styles/zen-browser-container.css`, `zen-theme.css`):
- The hidden toolbar is a thin strip (`--zen-element-separation`). On hover its **height** grows to the toolbar height (38px) with `0.15s ease-in-out` (`--zen-hidden-toolbar-transition`). Its contents fade from `opacity: 0` to `1` with the same timing.
- By default (`zen.view.shift-down-site-on-hover = false`) the website gets a matching negative `margin-top` while the toolbar is hovered. That cancels the push: **the page stays still and the bar covers its top.**
- Zen keeps it open while the pointer is just above the window (`outside-window-edge-offset`), and falls back to hiding 1000ms after hover ends.

Ours copies that exactly:
- 4px edge strip (the frame padding), height grows via `grid-template-rows: 0fr → 1fr`, 150ms ease-in-out, contents fade with the same timing.
- No shadow; the bar uses the window background.
- The website is a native webview above the UI, so the frontend reports the bar's rect every frame and Rust cuts it out of the webview's clip region (`set_content_cutout`). The page never reflows or moves.

## Sidebar peek (2026-10-18)
Studied Zen's compact mode (`src/zen/compact-mode/sidebar.inc.css`, `ZenCompactMode.mjs`, `prefs/zen/compact-mode.yaml`, `zen-theme.css`):
- **Layouts** (Settings › Browser Layout): *Only Sidebar* (`zen.view.use-single-toolbar = true`, default: URL bar and nav live in the sidebar), *Sidebar and Top Toolbar*, *Collapsed Sidebar*. Compact mode's own menu adds *Hide sidebar* (default), *Hide toolbar*, *Hide both*. Ezel follows **Only Sidebar** with compact mode hiding the sidebar.
- **Geometry**: the sidebar is fixed and floats 8px from the window edges (`--zen-element-separation`, default 8). Hidden, it's moved off by `-(100% − 8px − 1px)`.
- **Motion**: reveal is `translate 0.25s` on a spring-like `linear()` curve (overshoots to 1.011 at about 73%, settles). Hide is `0.15s ease`.
- **Look**: a rounded card (`--zen-native-inner-radius`) with a 1px outline and `rgba(0,0,0,.24) 0 3px 8px` shadow.
- **Hover**: opens on mouseover of the edge strip or sidebar. On leave it keeps 150ms (`sidebar-keep-hover`) before closing. Leaving through the window's left edge keeps it open while the cursor is within 200px outside (native mouse tracker), falling back to 1000ms. It stays open while a popup is open (`has-popup-menu`).

Ours:
- shadcn `variant="floating"` gives the card. Unlike Zen it has no float margin: the card runs to the top, bottom and left of the browser area (`p-0`) and takes the frame radius. Collapsed + peeking overrides the off-canvas `left` back to 0. Timing and curve match Zen (`--ease-zen-peek` samples Zen's curve).
- The trigger is the frame's 4px left padding: the only UI the website doesn't cover there. The 150ms keep-hover covers crossing the 8px gap to the card.
- Also stays open while the sidebar holds focus (typing in the URL bar must not be cut off by a mouse twitch).
- Out of the tab order (`inert`) while hidden off-canvas.
- The card + 1px ring is cut out of the website (`useContentCutout("sidebar")`, rounded). The shadow outside it can't be drawn over the page (it would sit on the UI's placeholder, not the site), so over the page the card shows its ring only.
- Open (Ctrl+B / trigger) docks it beside the page, like turning compact mode off. Docked it switches to shadcn's flat `variant="sidebar"`: no border, ring, shadow, radius or padding; the window frame's 4px is the only gap. The card look is only for floating over the page.

## Scrollbar (2026-10-18)
**App scroll areas** (`shared/components/scroll-area`, used for the sidebar body):
- Native scrolling stays: wheel, keyboard, touch and momentum behave exactly as the OS does. Only the visual scrollbar is replaced.
- No track and no background. The thumb is a small pill: resting length is proportional but clamped to 20–44px, so it reads as a position marker, not a bar.
- Width 4px, 6px while hovered or dragged. `foreground/25`, `/40` when active.
- Hidden at rest. It shows while scrolling, while the pointer is in the 10px right-edge zone, and while dragging. It lingers 900ms after scrolling stops, then fades out (120ms in, 300ms out).
- **Elastic:** its length stretches with scroll speed, up to 2× at 2400px/s. The leading edge tracks the real position and the trailing edge lags behind, like a pulled elastic. The stretch runs through a slightly under-damped spring (stiffness 520, damping 26, mass 0.6), so when scrolling stops it snaps back a hair past rest and settles.
- No stretch while dragging (the thumb should feel held) or with reduced motion.
- Edges fade (16px mask) only where more content is hidden; the fade grows in over the first 16px of scroll, so it never pops.
- The right-edge hover zone forwards wheel events, so scrolling never dies over it.

**Website scrollbars:** the website draws its own scrollbars inside the native webview, so app code can't replace them. Both webviews use WebView2's Fluent overlay style (thin, trackless, auto-hiding; WebView2 125+). The elastic effect would need injecting CSS/JS into every site; not done.

## Sizing (2026-10-18)
`docs/design/sidebar-1.png` is a 1.5× export. At its 1× sizes (10.5px tab titles, 14px favicons, 18×14 buttons) the sidebar was hard to read and hit, especially in a small window. We scale it up, text most, without going large:

Since 2026-10-18 the sidebar uses shadcn's Sidebar primitives at their defaults, so most sizes come from shadcn (`components/ui/sidebar.tsx`, never edited):

| Element | Design 1× | Now |
|---|---|---|
| Sidebar width | 212 | 244 (`SIDEBAR_WIDTH`) |
| Group / header / footer padding | 10 | 8 (shadcn `p-2`) |
| Swatch | 45×27, r7.5 | 4 fluid columns (~54) × 32, shadcn menu-button radius |
| Tab row | 28 high, 10.5px text, 14px favicon | `SidebarMenuButton`: 32 high, 14px text, 16px favicon |
| Folder row | 9px label | `SidebarMenuButton size="sm"`: 28 high, 12px, muted |
| Space pill / buttons | 15 high, 9px | `SidebarMenuButton size="sm"`: 28 high, 12px, 14px icon |
| New Tab | 26 high | 32 high, inset 12px each side, dimmed |
| Bottom actions | 18×14, r5 | 28×24 pills, 14px icons |
| URL bar | – | `SidebarInput`, 32 high |
| Nav / toggle buttons | – | `Button size="icon-sm"` / `SidebarTrigger`, 32px |

Why these numbers: 13–14px is the common sidebar text size (Arc, Zen, macOS source lists, shadcn). It stays legible at 100% scaling without crowding a 244px column. A 32px row is easy to hit while keeping about 20 rows visible in an 800px window. Radii scale with their elements so the shapes keep the design's proportions.
