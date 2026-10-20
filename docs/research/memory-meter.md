# Per-tab memory (2026-10-20)

Used for: the load meter (`get_memory`, `browser/memory.rs`). Later: smart sleep, the "Ezel vs Zen" RAM posts.

## Findings
- **Chrome** (119+, Nov 2023) shows "Memory usage" in each tab's hover card: the page plus its associated background processes, also for tabs Memory Saver froze. No breakdown: that's in its Task Manager. So per-tab memory is a familiar idea; the number on hover is the convention.
- **WebView2 gives processes, not tabs.** `ICoreWebView2Environment13.GetProcessExtendedInfos` lists every process (browser, GPU, utility, renderers) with the frames each renders (`AssociatedFrameInfos`). A tab's main-frame id is `ICoreWebView2_20.FrameId` (0 until the first navigation). Following a frame's `ParentFrameInfo` to the top maps a cross-site iframe's process to its tab.
- **Sharing.** Same-site tabs may share a renderer, and the browser/GPU processes serve everyone. Honest reporting = split shared renderers evenly and say "approximate"; keep the shared processes as their own line, never spread over tabs.
- **Which number.** Private bytes (`PROCESS_MEMORY_COUNTERS_EX.PrivateUsage`, `GetProcessMemoryInfo`) is what a process alone commits. Task Manager's default "Memory" column is the private working set, so the two differ a little; both are approximations.
- WebView2's memory knobs (`MemoryUsageTargetLevel`, `TrySuspendAsync`) are best-effort (vision doc, technical notes); the hard 8-loaded-tab cap is the real guarantee.

## Ezel's take (vision: Light, Calm, Crafted)
A quiet sentence, not a dashboard: "Ezel is carrying ~N MB", always with "~". The list lives in a tooltip, and unloaded tabs are "resting" rather than "0 MB". Refreshed only while the sidebar is visible.

## Sources
- Chrome hover-card memory (9to5Google): https://9to5google.com/2023/11/07/chrome-tab-memory-usage/
- What the number covers (Windows Latest): https://www.windowslatest.com/2023/10/15/google-chromes-new-feature-reveals-how-much-ram-a-tab-is-using-on-windows-11/
- WebView2 process model: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-model
- CoreWebView2Environment (process infos): https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/winrt/microsoft_web_webview2_core/corewebview2environment
- WebView2 performance (memory target level, best effort): https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance
