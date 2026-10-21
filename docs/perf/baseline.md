# Memory baseline (2026-10-20)

Ezel `main` at `9f89fdf` plus the measurement hook (`c180f38`), release build:
`npx tauri build --no-bundle --features perf` (`npm run tauri` is mapped to `tauri dev`, so the CLI is called directly).
Measured with `scripts/measure-memory.ps1`, 2 runs per scenario, 3 samples per run, medians.

## How it's measured
- **Whole process tree**: `app.exe` plus every process below it (WebView2's browser, GPU, utility, crashpad and renderer processes), found through parent process ids.
- **Private WS** (private working set) is what Task Manager's "Memory" column shows; this is the headline number. **Private bytes** is committed memory (what Ezel's load meter reports); it's always higher.
- **Scenarios** (tabs opened by the `perf` hook, one a second, in a throwaway session):
  - `launched`: first-run state, one Google home tab, 20s after start.
  - `ui-only`: no tabs at all (Ezel's own UI), 20s after start.
  - `1tab`: example.com, 20s after it opened.
  - `5tabs`: example.com, wikipedia.org, developer.mozilla.org, news.ycombinator.com, rust-lang.org.
  - `10tabs`: those plus tauri.app, w3.org, react.dev, vite.dev, github.com. Only the last one is visible.
  - `idle5min`: the 10 tabs, measured 5.5 minutes after they opened (the app untouched).
- Real sites load from the network, so runs differ by a few percent (up to ~20% on the idle runs): compare medians, and the per-run column.
- Machine: Windows 11 (26300), WebView2 runtime 155.0.4283.62.

## Results

| Scenario | Private WS (MB) | Private bytes (MB) | Processes | Renderers | By kind | WebView2 data dirs | Private WS per run |
|---|---|---|---|---|---|---|---|
| launched | 191.1 | 335.8 | 8 | 2 | app=1 browser=1 crashpad-handler=1 gpu=1 renderer=2 utility=2 | 1 | 187.0 / 195.1 |
| ui-only | 105.1 | 210.0 | 7 | 1 | app=1 browser=1 crashpad-handler=1 gpu=1 renderer=1 utility=2 | 1 | 106.8 / 103.3 |
| 1tab | 147.7 | 295.2 | 8 | 2 | app=1 browser=1 crashpad-handler=1 gpu=1 renderer=2 utility=2 | 1 | 143.6 / 151.7 |
| 5tabs | 242.5 | 478.4 | 12 | 6 | app=1 browser=1 crashpad-handler=1 gpu=1 renderer=6 utility=2 | 1 | 239.3 / 245.7 |
| 10tabs | 774.8 | 1200.0 | 15 | 9 | app=1 browser=1 crashpad-handler=1 gpu=1 renderer=9 utility=2 | 1 | 796.3 / 753.3 |
| idle5min | 714.7 | 1153.6 | 16 | 10 | app=1 browser=1 crashpad-handler=1 gpu=1 renderer=10 utility=2 | 1 | 639.9 / 789.5 |

## Findings (before changing anything)

1. **One WebView2 environment, one browser process.** Every process in every scenario reports the same single `--user-data-dir` (`%LOCALAPPDATA%\com.ezel.dev\EBWebView`), and there is exactly one browser, one GPU, two utility and one crashpad process however many tabs are open. The code sets no per-webview data directory, and all webviews pass the same `BROWSER_ARGS`, so they all join one environment. Nothing to fix.
2. **One renderer per loaded tab.** Renderers = loaded tabs + 1 (the UI) when every tab is a different site: 1 tab → 2, 5 tabs → 6, 10 tabs → 9. That's Chromium's site isolation, which stays on (it's a security feature). Same-site tabs can share a renderer.
3. **Unloaded tabs truly destroy their webview.** With 10 tabs opened, 2 are unloaded by the 8-tab cap and only 9 renderers remain (8 tabs + UI). `Effect::Destroy` calls `webview.close()`, and wry's drop closes the WebView2 controller and destroys its window. (The idle run's 10th renderer is a spare process Chromium sometimes keeps for the next navigation.)
4. **The cap and the idle timer decide most of the memory.** 5 tabs cost 242 MB; 10 tabs cost 775 MB, because 8 of them stay loaded and the later sites (GitHub, react.dev, tauri.app) are heavy. After 5 minutes idle nothing changes (715 MB): background tabs only unload after **30 minutes**.
5. **Ezel's own UI is cheap.** With no tabs: 105 MB in all. About 60 MB of that is WebView2's fixed processes (browser, GPU, utility) that any WebView2 app pays, and the UI's renderer is roughly 40–45 MB. The UI doesn't poll while idle: the load meter polls only while the sidebar is visible, and the remaining timers and frame loops run only during an interaction (peek tracking, popup cutouts while they move, toasts).
6. **Hidden tabs already get WebView2's low memory target** (`set_low_memory` on hide). WebView2 documents it as best-effort; the numbers above include it.

## What to try (from `docs/goal-2-performance.md`)
- Fewer loaded tabs (5 instead of 8) and a shorter idle timer (5 minutes instead of 30), checked more often so tabs rest on time. Expected: the biggest win at 10 tabs and after idling.
- `TrySuspend` for hidden background tabs (not the shown tab, dev tabs or tabs playing audio).
- WebView2 settings and Chromium flags only where measured.
