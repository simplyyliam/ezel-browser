import { useEffect, useState } from "react"
import { reportError, type TabsState } from "@/shared"
import { commands, type MemoryReport } from "@/shared/bindings"
import type { LoadMeterData } from "@/features/app-sidebar/bottom-actions"
import { findTab } from "./tab-menu"

/** Often enough to feel live, rarely enough to cost nothing (the call walks every WebView2 process). */
const REFRESH_MS = 4000

/**
 * The load meter's numbers (`get_memory`), refreshed every few seconds only while the sidebar can
 * be seen (docked or peeking) and the window isn't hidden. The call never blocks the UI: it's async,
 * and a refresh is skipped while the previous one is still out. Stops for good where it's
 * unsupported (not Windows). Null until the first answer, and again after a failed one (the readout
 * hides; `unavailable` is expected and not logged).
 */
export function useLoadMeter(visible: boolean, tabs: TabsState | null): LoadMeterData | null {
  const [report, setReport] = useState<MemoryReport | null>(null)
  const [unsupported, setUnsupported] = useState(false)

  useEffect(() => {
    if (!visible || unsupported) return
    let cancelled = false
    let inFlight = false
    const refresh = async () => {
      if (inFlight || document.visibilityState !== "visible") return
      inFlight = true
      try {
        const result = await commands.getMemory()
        if (cancelled) return
        if (result.status === "ok") setReport(result.data)
        else if (result.error.code === "unsupported") setUnsupported(true)
        else {
          // No reading this time: the readout hides until the next good one. "unavailable" is
          // expected now and then (WebView2 slow to answer, a reading already running), so it's quiet.
          setReport(null)
          if (result.error.code !== "unavailable") reportError("read memory", result.error)
        }
      } catch (error) {
        if (!cancelled) setReport(null)
        reportError("read memory", error)
      } finally {
        inFlight = false
      }
    }
    refresh()
    const timer = window.setInterval(refresh, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [visible, unsupported])

  if (!report || !tabs || unsupported) return null
  const allTabs = [
    ...tabs.swatches.flatMap((tab) => (tab ? [tab] : [])),
    ...tabs.spaces.flatMap((space) => [
      ...space.items.flatMap((item) => (item.kind === "tab" ? [item.tab] : item.folder.tabs)),
      ...space.tempTabs,
    ]),
  ]
  return {
    totalMb: report.totalMb ?? 0,
    sharedMb: report.sharedMb ?? 0,
    // A tab closed since the report has no row to name; it's simply left out.
    tabs: report.tabs.flatMap(({ id, mb, approximate }) => {
      const tab = findTab(tabs, id)
      return tab ? [{ tab, mb: mb ?? 0, approximate }] : []
    }),
    restingCount: allTabs.filter((tab) => !tab.isLoaded).length,
  }
}
