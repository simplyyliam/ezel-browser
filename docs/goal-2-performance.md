# Goal 2: Performance

Goal: make Ezel use clearly less memory than Zen, without changing anything visual. Work on branch
perf/memory, merge only if every check passes AND the measured numbers improved.

## Rules

- No visual or behavioural change a user would notice, except tabs reloading when they were unloaded.
- Measure, change, measure again. Every change must show its effect in numbers; revert changes that
  don't help.
- Measure ONLY release builds (npm run tauri build), never tauri dev.
- Never run two Ezel instances. Follow CLAUDE.md and the security rules (websites never reach IPC).
- You can't click the window, so add a measurement-only way to open tabs: on startup, if the
  EZEL_PERF_URLS environment variable is set (comma-separated URLs), open them as temp tabs. Compile this
  only with a cargo feature named "perf" so normal builds ignore it. The measure script sets it.

## 1. Baseline

Using a release build, measure the total memory of Ezel's whole process tree (the app plus every
msedgewebview2 process it started) in these scenarios:

- just launched
- 1 tab
- 5 tabs
- 10 tabs with only 1 visible
- after 5 minutes idle

Write a script (scripts/measure-memory.ps1) so I can repeat it. Save results to docs/perf/baseline.md.

## 2. Investigate

- Confirm every tab shares ONE WebView2 environment and user-data folder (one browser process).
- Check how many renderer processes exist per tab.
- Check whether unloaded tabs truly destroy their webview.
- Check the UI webview's own memory (React app, motion, favicons).

Write your findings down before changing anything.

## 3. Candidate changes

Only make these where measurement shows a gain:

- **Tune unloading:** fewer loaded tabs (try 4 to 6 instead of 8), unload idle background tabs sooner
  (try 5 to 10 minutes), never the shown tab, dev tabs, or tabs playing audio.
- **Hidden tabs:** MemoryUsageTargetLevel Low, and TrySuspend for background tabs if it works reliably.
- **WebView2 settings:** disable what Ezel doesn't use (e.g. built-in browser accelerator keys we already
  handle, DevTools in release builds only if F12 can still enable them on demand). Don't disable
  security features (SmartScreen, site isolation).
- **Experimental Chromium flags** (e.g. renderer process limits): only behind a setting that's OFF by
  default, documented with the measured gain and the risk.
- **UI webview:** avoid needless re-renders, store favicons as small cached images, make sure animations
  stop when idle, no polling while the sidebar is hidden.

## 4. Result

- Re-run the same scenarios.
- Write docs/perf/results.md with a before/after table, which changes helped, and which were reverted and
  why.
- Add the scenario script and the numbers to CLAUDE.md under "Performance", with the rules future
  features must follow (no polling, no timers while idle, tabs unload by default).

## Commits and report

Commits: Conventional Commits subject under ~70 characters, at most 5 short bullets.

End with STATUS, CHECKS, NEEDS YOUR DECISION, plus a short note on what I should compare with Zen myself.