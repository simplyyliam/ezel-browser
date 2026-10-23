import { useEffect, useState } from "react"
import { commands, events } from "./bindings"
import { reportError, unwrap } from "./report-error"
import { showToast } from "./toast"

/** The shown tab's find results ("find-changed"), while find in page is open. */
export function useFindResults(open: boolean) {
  const [results, setResults] = useState<{ active: number; count: number } | null>(null)
  useEffect(() => {
    if (!open) return
    const unlisten = events.findChanged.listen((event) => setResults(event.payload))
    return () => {
      setResults(null)
      unlisten.then((fn) => fn())
    }
  }, [open])
  return results
}

/** Highlights `query` in the shown page (an empty one clears). Says so if the runtime can't. */
export async function findInPage(query: string) {
  try {
    const result = await commands.findStart(query)
    if (result.status === "error") {
      if (result.error.code === "unsupported") showToast({ title: "Find needs a newer WebView2", tone: "info" })
      else if (result.error.code !== "no_tab_shown") reportError("find in page", result.error)
    }
  } catch (error) {
    reportError("find in page", error)
  }
}

export const findNext = (backward: boolean) => unwrap("find next", commands.findNext(backward))
export const stopFinding = (refocus: boolean) => unwrap("stop finding", commands.findStop(refocus))
