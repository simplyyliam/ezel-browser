# Many tabs

Reported 2026-10-23: Ezel felt slow with ~130 tabs (126 unloaded, 4 loaded) imported from Zen, while memory and webviews were fine. Measured first, fixed only what was small. Branch `perf/many-tabs`.

## What the session looked like

The real `session.json` (only counts and sizes were read, never its contents): **29 MB** for 131 tabs in 7 spaces. 121 favicons were inline `data:` images totalling 28.9 MB: median 3.3 KB, 101 of them under 32 KB, 7 between 64 KB and 363 KB, and **one of 26 MB**. They came from Zen: Firefox's session store keeps a base64 copy of each tab's icon ([bug 1968317](https://bugzilla.mozilla.org/show_bug.cgi?id=1968317); users report 70 MB session files), and Ezel's import took `data:image/…` icons as they were. Pages' own `data:` favicons (WebView2's `FaviconUri`) were unlimited too.

Every `tabs-changed` event carries every tab with its favicon, and every change (and every page event: title, loading, favicon) serialised the whole session for the save. So each click moved 29 MB through IPC and serialised another 29 MB.

## How it was measured

- **Seed** (`EZEL_PERF_URLS=seed`, perf builds only, `browser/perf.rs`): 131 tabs over 6 spaces (6 pinned, 2 folders of 4, 6 temp each, plus 11 Swatches), 121 of them with filler `data:` favicons of exactly the real session's lengths, 4 loaded (`example.com`). Built before the UI asks for it, like a session read from disk, in the throwaway `ezel-perf` folder.
- **Rust notes** (perf builds): every event's JSON size and emit time, every session serialise and write (`ezel-perf <what> bytes= us=` on stderr; names and numbers only).
- **UI** (`VITE_EZEL_PERF=1`, `shared/perf.ts`): React's profiling build with a `<Profiler>` around the sidebar (commit times), a render counter in `TabRow`, long tasks, `data-tab-id` on rows. Compiled out of normal builds (checked: no trace in `dist/`).
- **Driver**: `scripts/measure-many-tabs.mjs` launches the build, attaches over WebView2's DevTools port (perf builds only) and measures each action from the click or command to the frame after its React commit. Scrolling and dragging use real mouse events (wheel, press, move) while counting frames.
- Release builds, the same machine and session, **3 alternating rounds** (before, after, before, …); medians below. The first attempts were thrown away: a killed run's WebView2 processes survived and the next launch joined them (the script now clears them first).

## Results

| With 131 tabs, 4 loaded | Before | After | |
|---|---|---|---|
| Launch to sidebar rows shown (no long task after) | 1453 ms | **1105 ms** | −24% |
| Switching tabs (row click → painted) | 1288 ms | **86 ms** | −93% |
| Switching spaces | 1394 ms | **95 ms** | −93% |
| Opening a tab (includes creating its webview) | 1841 ms | **357 ms** | −81% |
| Closing a tab | 1406 ms | **146 ms** | −90% |
| Muting a tab (a whole-state `tabs-changed`) | 1371 ms | **64 ms** | −95% |
| Rows re-rendered: one tab's page changes (`tab-updated`) | 20 | **1** | |
| Rows re-rendered: one tab changes via `tabs-changed` | 20 | **1** | |
| Rows re-rendered: switching tabs / opening / closing | 20 / 82 / 20 | **2 / 3 / 1** | |
| Rows re-rendered: switching spaces | 20 | 20 | the new space's list is drawn |
| React commit: switching tabs / opening | 12 / 45 ms | **6 / 19 ms** | |
| `tabs-changed` size / emit time in Rust | 29.0 MB / 105 ms | **0.74 MB / 4 ms** | |
| Session save: size / serialise / write | 29.0 MB / 42 ms / 35 ms | **0.73 MB / 1.8 ms / 7 ms** | |
| Session saves written in a run (debounced 1s) | 35 | **13** | |
| Idle 20 s: `tabs-changed` events, rows re-rendered | 2, 40 | **0, 0** | |
| Scrolling the sidebar: fps, p95 frame, frames > 33 ms | 60, 17.1 ms, 0 | 60, 17.0 ms, 0 | already fine |
| Dragging a tab: fps, p95 frame, rows re-rendered | 60, 17.1 ms, 20 | 60, 17.0 ms, **6** | already smooth |

(The one idle save left in "after" is the 1 s debounced write of the change just before the idle window.)

## Causes, by measured cost

1. **Huge favicons in every event and save** (~95% of every action): 29 MB per `tabs-changed`, about 1.2 s to emit, parse and apply; 29 MB serialised per change. **Fixed**: favicons are capped at 64 KB, Firefox's own favicon service limit (`MAX_FAVICON_BYTES` in `nsIFaviconService.idl`, added after a huge favicon ran Firefox out of memory, [bug 1174811](https://bugzilla.mozilla.org/show_bug.cgi?id=1174811)), on add, on WebView2's favicon event and when a saved session loads (so existing sessions shrink without a re-import). For the real session: 108 of 121 inline icons kept (0.7 MB); the 13 bigger ones show the empty icon until the tab is next opened, when the site's icon address arrives. Chromium goes further and keeps favicons out of tab and session data entirely, in their own database ([favicon service](https://chromium.googlesource.com/chromium/src.git/+/73.0.3632.1/components/favicon/core/favicon_service.h)).
2. **The idle check sent and saved everything every 15 s** even when it changed nothing (a 29 MB event plus a save, ~200 ms of work, and a full sidebar re-render). **Fixed**: `check_idle` emits and saves only when it unloaded a tab.
3. **Every row re-rendered on any change** (20 per action, 82 opening a tab): each row's `actions` prop was rebuilt with the whole tab list, and every `tabs-changed` brought new objects for every tab. **Fixed**: `DraggableTabItem` is memoised on its own slice (tab, active, editing, dragged, drop line), the widget's callbacks keep their identity (they read the latest state when called), and the store keeps the old object of every tab that didn't change.
4. Scrolling and dragging were already at 60 fps with no dropped frames; nothing to fix. No virtualisation needed at this size: a space shows about 20 rows.

## What's left (not done: bigger changes)

- A tab switch still sends the whole tab list (0.74 MB, mostly favicons) and takes ~86 ms, about half of it the two frames the measurement waits for. Sending only what changed, or keeping favicons out of the tab list (Chromium's design: a separate favicon store the UI loads by id), would cut that further. Both change the backend/UI contract; worth it only with much bigger sessions.
- Many tabs on one site each carry their own copy of the same `data:` icon (Firefox's bug 1968317 in Ezel): 79 distinct icons among the 121. A shared favicon store would fix that too.
