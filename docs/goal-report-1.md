# Goal 1 report (2026-10-20)

All 7 features from `docs/goal-1.md` are merged into `main` with `--no-ff`, each tagged, each after every check passed on its branch. None was skipped. One preparatory refactor was merged first (see below). Everything is backend first, then frontend, with Rust tests.

## STATUS

| # | Branch | Result | Tag | What it does |
|---|---|---|---|---|
| 0 | `chore/bindings-only` | merged (no tag, not a feature) | — | Main failed the grep check from the start: `src/shared/tauri.ts` still imported `@tauri-apps/api/core`/`event`. Removed it; every caller now uses the generated `shared/bindings.ts` (behaviour unchanged). |
| 1 | `feat/hotkeys-pack` | merged | `goal-hotkeys-pack` | Ctrl+W, Ctrl+Tab / Ctrl+Shift+Tab (recently used, per space), Ctrl+1…8 swatches, Ctrl+9 last tab, Ctrl+R/F5, Ctrl+Shift+R, Alt+←/→, Esc stops loading, F12 / Ctrl+Shift+I DevTools, Ctrl+Shift+C copies the link with a toast. |
| 2 | `feat/reopen-closed-tab` | merged | `goal-reopen-closed-tab` | A persisted closed-tab stack (25); Ctrl+Shift+T and the sidebar menu bring tabs back to their space, folder or swatch slot and position. |
| 3 | `feat/mute-tab` | merged | `goal-mute-tab` | Per-tab mute (WebView2 `IsMuted`), a speaker on the row (waves breathe while playing, crossed when muted), Mute/Unmute in tab and swatch menus. |
| 4 | `feat/localhost-tabs` | merged | `goal-localhost-tabs` | Tabs on localhost / 127.0.0.1 / [::1] / *.localhost are never auto-unloaded and carry a small "dev" chip. |
| 5 | `feat/quiet-defaults` | merged | `goal-quiet-defaults` | No password saving or autofill, notifications denied without a prompt, no autoplay with sound before the page is used. |
| 6 | `feat/load-meter` | merged | `goal-load-meter` | "Ezel is carrying ~N MB" in the sidebar footer, per-tab breakdown in a tooltip, polled only while the sidebar is visible. |
| 7 | `feat/lenses-squint-greyscale` | merged | `goal-lenses-squint-greyscale` | One reusable "inject a named CSS layer" path; Squint and Greyscale lenses on Ctrl+Alt+S / Ctrl+Alt+G and in the palette. |

All feature branches were deleted after merging (`git branch -d`). No history was rewritten and no tags were deleted.

## CHECKS

Final results on `main`, merge commit `04e6f46` (feature 7), re-run after this report's merge:

| Check | Result |
|---|---|
| `cargo check` | PASS |
| `cargo clippy --all-targets` | PASS, 0 warnings |
| `cargo test` | PASS, 55 passed, 0 failed (25 before this goal) |
| `tsc -b` | PASS |
| `vite build` | PASS |
| lint (`oxlint`) | PASS, exit 0; 7 warnings, the same 7 that were on main before the goal (shadcn/theme files, `use-mobile.ts`, `tab-row.tsx`). No new ones. |
| `grep -rn "@tauri-apps/api/core\|@tauri-apps/api/event" src` | PASS, matches only `src/shared/bindings.ts` |

Runtime smoke runs (`npm run tauri dev`, one instance, stopped afterwards; I can't see the window):
- After feature 5: the WebView2 browser process runs with `--autoplay-policy=document-user-activation-required` next to wry's defaults, so the shared-arguments change works. No webview creation errors; no UI console errors (so Rust accepted the new hotkey list).
- On final `main`: starts cleanly, the restored tab's webview is created, no errors in the Rust log or the forwarded UI console.

Frontend tests: the project has no JS test runner, so none were added (as instructed). Pure helpers that would be tested first: `nthSwatch`, `lastTabOf` (`shared/browser-hotkeys.ts`), `keyName`/`matchesHotkey` (`shared/hotkeys.ts`), `formatMemory` (`load-meter.tsx`). The generated lens JavaScript was run in Node against a fake DOM: apply, idempotent re-apply, remove, waiting for `<html>`, and skipping iframes all passed.

## MANUAL TESTS

Run `npm run tauri dev`. Open 3–4 tabs on different sites first.

**1. Hotkeys pack** (try each once with the page focused (click into it) and once with the sidebar focused)
- [ ] Ctrl+W closes the shown temp tab; on a pinned tab it unloads (dims) and stays.
- [ ] Visit tabs A, then B, then C. Ctrl+Tab → B. Press Ctrl+Tab twice quickly → B then A. Wait 2s, Ctrl+Tab → goes back to the previous tab. Ctrl+Shift+Tab walks the other way. Tabs of other spaces never appear.
- [ ] With 2+ swatches: Ctrl+1 / Ctrl+2 select them in grid order; Ctrl+9 selects the bottom row of the space's list.
- [ ] Ctrl+R and F5 reload the page (not the Ezel UI), also when the sidebar has focus. Ctrl+Shift+R reloads (DevTools › Network shows requests not from cache).
- [ ] Alt+← / Alt+→ go back/forward.
- [ ] Start loading a slow page and press Esc: loading stops. On a site with a modal (Esc closes it), Esc still closes the modal when the page isn't loading.
- [ ] F12 and Ctrl+Shift+I open DevTools for the page in their own window.
- [ ] Ctrl+Shift+C with the page focused: paste elsewhere gives the URL. A pill "Link copied · host" rises bottom-left above the footer with a check that draws itself, then fades after ~2s, both with the sidebar docked (Ctrl+B) and collapsed (it shows over the page). The page keeps focus (keep typing in a field).
- [ ] Ctrl+T, Ctrl+L, Ctrl+B still work.

**2. Reopen closed tab**
- [ ] Close two temp tabs from the middle of the list; Ctrl+Shift+T twice: both come back in their old positions, the last closed first, selected.
- [ ] Trash-all (bin icon), then Ctrl+Shift+T three times: the tabs return top-first in the same order.
- [ ] Close a pinned tab with its × (only unloads); Ctrl+Shift+T doesn't restore it.
- [ ] Right-click empty sidebar space: "Reopen Closed Tab" appears after New Tab only while there's something to reopen.
- [ ] Restart Ezel: Ctrl+Shift+T still reopens tabs closed before the restart.
- [ ] With nothing left: a toast "No closed tabs to reopen".

**3. Mute tab**
- [ ] Play a YouTube video: a speaker appears at the row's end with gently breathing waves; hover the row: it slides left and × appears.
- [ ] Click the speaker: sound stops, the icon shows a cross; click again: sound returns. The click doesn't select the tab or start a drag.
- [ ] Right-click the row: "Mute Tab" / "Unmute Tab" (also on a swatch that plays sound).
- [ ] Mute, unload the tab (menu › Unload Tab), select it again, play: still muted. Also after a restart.
- [ ] With reduced motion on in Windows, the waves don't animate.

**4. Localhost tabs**
- [ ] Open `http://localhost:5173` (Ezel's own dev server works): the row shows a small "dev" chip with a tooltip.
- [ ] Open 9+ other tabs one after another: the localhost tab stays loaded (not dimmed) while older non-dev tabs unload.
- [ ] Menu › Unload Tab on the dev tab still unloads it.

**5. Quiet defaults**
- [ ] Sign in on a site with a password: no "Save password?" prompt.
- [ ] Open a site that asks for notifications (e.g. a news site, or `Notification.requestPermission()` in DevTools): no prompt; the result is `"denied"`.
- [ ] Open a page that autoplays video with sound (a news video page): no sound until you click the page; muted background videos still play.
- [ ] Fill a form: no autofill suggestions drop down.

**6. Load meter**
- [ ] Dock the sidebar (Ctrl+B): the footer reads "Ezel is carrying ~N MB"; the number eases to new values every few seconds as pages load.
- [ ] Hover (or Tab-focus) it: a dark tooltip lists the heaviest tabs with favicons, "Ezel and shared", "N tabs are resting", and "≈" rows with a footnote when two same-site tabs share a process.
- [ ] Compare the total roughly with Task Manager (Ezel's app.exe plus the msedgewebview2 processes under it): same order of magnitude (the meter uses private bytes).
- [ ] Collapse the sidebar: no more polling (DevTools of the UI › Network/IPC, or just no CPU blips); peeking resumes it.
- [ ] Unload every tab (or select an empty space): "Ezel is resting".

**7. Lenses**
- [ ] Ctrl+Alt+S: the page blurs, and a toast says "Squint on · Ctrl+Alt+S to clear". Again: off.
- [ ] Ctrl+Alt+G: greyscale. Both on together: blurred and grey.
- [ ] With a lens on, click links / navigate: it stays on for the new pages in that tab.
- [ ] Switch to another tab: the lens isn't there; switch back: it's off.
- [ ] Ctrl+T or Ctrl+L, type "squint" or "grey": "Squint Lens" / "Greyscale Lens" rows; their hint says Turn On / Turn Off.
- [ ] Pages with iframes (an embed): the blur isn't doubled inside the iframe.

## NEEDS YOUR DECISION

Choices I made on your behalf (all the conservative option, all easy to change):

1. **Prep refactor merged before feature 1** (`chore/bindings-only`): main failed the grep check, so no feature could pass otherwise. Also moved the store test's temp folder from the system temp dir to `src-tauri/target/test-tmp` (the "write only inside the repo" rule).
2. **Ctrl+Tab = recently used order**, within the active space. Ezel can't see the Ctrl key being released while the page has focus, so presses within 1.2s continue one walk (as if Ctrl were held). Swatches aren't in the walk, but a shown swatch starts it. Alternative: sidebar order.
3. **Ctrl+1…8 = the n-th swatch as the grid shows it**; Ctrl+9 = the bottom row of the space's list. Chrome's meaning is "n-th tab".
4. **Shortcuts act on the page even when the UI has focus**: Ctrl+R/F5 reload the page, not the Ezel UI; F12 opens the page's DevTools (the UI's own DevTools: right-click › Inspect in a debug build).
5. **Esc stops loading only while the page loads**; otherwise websites (and the UI's menus/fields) keep Esc.
6. **DevTools are enabled for tab webviews in release builds** (`devtools(true)`), which also adds WebView2's right-click › Inspect to pages.
7. **Copy link writes the clipboard from Rust (Win32)**, because the UI can't write it while the page has focus. New error code `unsupported` for features that are Windows-only for now.
8. **Toasts**: one at a time, bottom-left above the sidebar footer, 1.8s. Wording: "Link copied · host", "No page to copy", "No closed tabs to reopen", "Squint on · Ctrl+Alt+S to clear", "Squint off", "Open a page to use a lens".
9. **Closed-tab stack**: tabs go on it when removed (temp close, `remove_tab`, trash-all), not when a pinned tab only unloads (as the goal said). Deleting a folder with its tabs, or a whole space, does **not** push its tabs (those are deliberate, confirmed deletions and would flood the stack). Reopen fallbacks: folder gone → end of its space's pinned list; space gone → the active space; swatch grid full → top of the active space's temp tabs.
10. **"Reopen Closed Tab" lives only in the sidebar menu** (moved from the catalog's tab area), as the goal asked; it isn't on tab rows.
11. **Mute persists** across unloads and restarts (stored on the tab); the crossed speaker shows even when the tab is silent, so a muted tab is never invisible.
12. **Dev tabs**: no indicator on swatch tiles; no auto-reload on save (vision mentions it, the goal didn't ask).
13. **Autoplay**: blocked with Chromium's `--autoplay-policy=document-user-activation-required` browser argument (WebView2 has no API setting; its `AUTOPLAY` permission would also block muted autoplay). Because all webviews share one environment, the UI webview gets the same arguments. Passwords saved before still fill.
14. **Load meter numbers** are private bytes per process. Renderers shared by same-site tabs are split evenly (marked ≈). WebView2's browser/GPU/utility processes and Ezel itself are a separate "Ezel and shared" line, never spread over tabs. Polls every 4s, only while the sidebar is docked or peeking and the window is visible. With nothing loaded it says "Ezel is resting" (the vision's donkey moment).
15. **Ctrl+K is not bound.** The goal calls the palette "Ctrl+K", but it opens with Ctrl+T / Ctrl+L today; the lenses are palette actions found by typing. Binding Ctrl+K (Chrome: search from the address bar) is your call.
16. **Lens keys Ctrl+Alt+S / Ctrl+Alt+G** equal AltGr+S/G on many European layouts (e.g. Polish "ś"), so they can swallow a character there. Kept as specified; rebindable later.
17. **Lenses** blur 5px; they turn off when another tab or an empty space is shown, and stay off on return.
18. **Smoke runs force-stopped Ezel** (no window to close), which skips the exit flush: at most the last second of session changes from those runs could be lost.

Skipped items: none. Every sub-item of the 7 features was built (DevTools through `OpenDevToolsWindow`, autoplay through the browser argument).

New dependencies: **none** (no new crates or npm packages). The existing `windows` crate gained four feature flags: `Win32_System_DataExchange` and `Win32_System_Memory` (clipboard), `Win32_System_ProcessStatus` and `Win32_System_Threading` (load meter).

Files the app writes (no new paths):
- `%APPDATA%\com.tauri.dev\ezel\session.json` (+ `.bak`, `.tmp`, and `.unreadable` for a broken file): existing, atomic. It now also holds the closed-tab stack (`closed`) and each tab's `muted`; files from before load fine (both default).
- `%LOCALAPPDATA%\com.tauri.dev\EBWebView\`: WebView2's own profile (cookies, cache), existing and managed by WebView2.
- The Windows clipboard (Ctrl+Shift+C).
- Tests write only under `src-tauri/target/test-tmp/`. My helper scripts and logs live in the git-ignored `src-tauri/target/`.

## SECURITY

Checked for this goal: the only capability file (`src-tauri/capabilities/default.json`) is scoped to `"webviews": ["ui"]`, so tab webviews get no IPC. New code logs no URLs or page content and makes no network calls. Lens scripts are built only from Rust constants: the UI sends a layer name that serde validates against an enum. They run in the top frame only, define no globals and send nothing back. New `unsafe` blocks are WebView2/Win32 interop with SAFETY comments (and a "why unsafe" note on the process-memory read).

Existing risks I found but did not change (per your rule not to refactor mid-feature):
1. **`"csp": null`** in `tauri.conf.json`: the UI webview has no Content Security Policy.
2. **Navigation accepts `file://` and any `about:` URL** (`resolve_input` in `browser/commands.rs`), and the UI can navigate anywhere through `navigate`/`open_tab`. Your rule: only http, https and about:blank.
3. **The app identifier is Tauri's default `com.tauri.dev`**, so the WebView2 profile (`%LOCALAPPDATA%\com.tauri.dev\EBWebView`, cookies and logins) is shared with any other app built from the Tauri template on this machine. The session already uses its own `ezel` subfolder for this reason; the WebView2 data doesn't.
4. **The command palette loads favicons from Google's favicon service** for typed hosts, which sends what you type to Google (a network call of Ezel's own).
5. **Session log lines include file paths** (`store.rs`), which contain the Windows user name.
6. **DevTools in release builds** (decision 6) let anyone at the keyboard inspect pages; pages can't open them on their own.
7. **Sized popups (`window.open` with a size) open as native WebView2 windows** outside Ezel's tab model, with no quiet defaults or shortcut forwarding applied. They do get the shared browser arguments and no IPC.
8. `clipboard.rs` (feature 1) uses Win32 `unsafe` that isn't WebView2 interop. It was written before the rule arrived and is documented with SAFETY comments.
