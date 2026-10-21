# Memory results (2026-10-21)

Branch `perf/memory`. Same method as `docs/perf/baseline.md`: release builds (`npx tauri build --no-bundle --features perf`), `scripts/measure-memory.ps1`, whole process tree (app + every WebView2 process). For a fair comparison the baseline binary (`main` + measurement hook, `c180f38`) and the final binary (`7bf441d`) were measured **in the same session, alternating runs**, 2 runs per scenario: real sites change from day to day (yesterday's baseline, in `baseline.md`, differs by a few percent).

## Before / after

Private WS = private working set (Task Manager's "Memory"); private bytes = committed memory. Each cell: median of 2 runs (each run the median of 3 samples).

| Scenario | Private WS before | Private WS after | Change | Private bytes before | Private bytes after | Change | Processes (renderers) before → after |
|---|---|---|---|---|---|---|---|
| just launched | 202.1 MB | 199.7 MB | −1% (noise) | 361.3 MB | 339.1 MB | −6% | 8 (2) → 8 (2) |
| UI only | 109.2 MB | 111.6 MB | +2% (noise) | 204.6 MB | 216.6 MB | +6% (noise) | 7 (1) → 7 (1) |
| 1 tab | 148.3 MB | 150.9 MB | +2% (noise) | 296.2 MB | 299.1 MB | +1% (noise) | 8 (2) → 8 (2) |
| 5 tabs | 217.1 MB | 217.3 MB | 0% | 513.5 MB | 514.4 MB | 0% | 12 (6) → 12 (6) |
| **10 tabs, 1 visible** | **733.8 MB** | **665.0 MB** | **−9%** | **1209.6 MB** | **1071.1 MB** | **−11%** | 15 (9) → 12 (6) |
| **after 5 min idle** | **602.3 MB** | **479.6 MB** | **−20%** | **1133.5 MB** | **752.0 MB** | **−34%** | 15 (9) → 8 (2) |

Per run (private WS / private bytes, MB):

| Scenario | Before run 1 | Before run 2 | After run 1 | After run 2 |
|---|---|---|---|---|
| just launched | 199.9 / 349.8 | 204.3 / 372.7 | 201.1 / 337.3 | 198.3 / 340.9 |
| UI only | 107.7 / 199.2 | 110.7 / 209.9 | 108.7 / 205.9 | 114.4 / 227.2 |
| 1 tab | 149.7 / 302.7 | 146.9 / 289.7 | 154.1 / 294.2 | 147.7 / 304.0 |
| 5 tabs | 220.3 / 527.2 | 213.8 / 499.8 | 215.8 / 518.7 | 218.7 / 510.1 |
| 10 tabs | 705.3 / 1211.3 | 762.3 / 1207.9 | 663.6 / 1076.4 | 666.3 / 1065.8 |
| after 5 min idle | 483.5 / 1149.1 | 721.0 / 1117.8 | 517.2 / 785.8 | 441.9 / 718.1 |

Reading it:
- **Nothing changes until there are more than 5 tabs or tabs sit idle**, by design: the light scenarios differ only by noise (±2%, and ±6% in private bytes).
- **10 tabs**: 3 fewer renderers (the cap is 5 loaded tabs now), and the 4 hidden ones are frozen after 30s. Both runs after are below both runs before.
- **After 5 minutes idle**: every background tab has rested; only the shown tab and the UI keep a renderer (15 → 8 processes). The working-set column is noisy here (the baseline's two runs were 484 and 721 MB) because Windows trims idle processes' working sets on its own schedule; private bytes, which Windows doesn't trim, show the real drop: −34%.

## What helped (kept)

1. **Unload tuning** (`c637f9e`): `MAX_LOADED_TABS` 8 → 5, `IDLE_UNLOAD_MS` 30 → 5 minutes, idle check every 60 → 15 seconds (so a tab rests within 15s of reaching 5 minutes). Never the shown tab, dev tabs or tabs playing audio (unchanged rules).
   Measured against the baseline (same day as the baseline, 2 runs): 5 tabs 242 → 234 MB (noise), 10 tabs 775 → 734 MB (−5%), after 5 min idle 715 → 451 MB (−37%).
   The 10-tab gain is small on its own because the cap keeps the 5 *most recently used* tabs, which in this scenario are the heaviest sites (GitHub, react.dev, tauri.app); the idle timer is what frees most memory.
   User-visible: a background tab you haven't looked at for 5 minutes reloads when you select it (the one change the goal allows).
2. **TrySuspend for background tabs** (`7bf441d`): a loaded tab hidden for 30s (not the shown one, not dev, not playing audio) is frozen with WebView2's `TrySuspend`; selecting it calls `Resume` (WebView2 also resumes on show). Rule in the model, tested.
   Measured A/B against change 1, alternating, 3 rounds, 10 tabs after 60s: 728 / 704 / 768 MB → 630 / 590 / 629 MB, median **728 → 629 MB (−14%)**, private bytes 1077 → 1020 MB (−5%). Every round lower.
   User-visible: none expected. A frozen page's timers stop while hidden and catch up when shown (Chrome and Edge freeze background tabs the same way); audio and dev tabs are never frozen.

## What didn't help (reverted or not done)

- **`--renderer-process-limit=3`** (experimental Chromium flag): built and measured, then reverted (never committed). With 10 tabs it still ran 6 renderers and 642 MB (vs 645 without it): with site isolation on (a security feature, kept), Chromium won't put different sites in one process, so the limit does nothing. Not added, not even behind a setting: no gain to offer.
- **Lower cap (4)**: not tried after 5 showed the cap matters far less than idle unloading (the remaining tabs are the heavy, recent ones). 5 keeps quick switching between a handful of tabs without reloads.
- **WebView2 settings** (browser accelerator keys, DevTools in release): not changed. They don't load anything until used (DevTools load only when opened; accelerator handling is code, not memory), so there's no memory to win, and the goal asks to change only what measurement shows. Security features (SmartScreen setting as configured, site isolation) untouched.
- **UI webview**: no change needed. With no tabs Ezel uses ~105–110 MB in all, of which ~60 MB is WebView2's fixed processes (browser, GPU, utility) and ~40–45 MB the UI's renderer. The UI already doesn't poll while idle (the load meter polls only while the sidebar shows; peek tracking, cutout frame loops and toasts run only during an interaction), and favicons are small images the webview caches. Nothing measurable to take out.
- **MemoryUsageTargetLevel Low**: already applied to hidden tabs before this work (part of the baseline).

## How to repeat
```
npx tauri build --no-bundle --features perf
powershell -ExecutionPolicy Bypass -File scripts/measure-memory.ps1
```
To compare two builds, copy each `src-tauri/target/release/app.exe` to its own folder and pass `-Exe`, alternating runs in one session. Raw logs of these runs stayed in the git-ignored `src-tauri/target/` (`perf-*.log`).
