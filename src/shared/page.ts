import { useEffect, useState } from "react"
import { commands, events, type PageChanged } from "./bindings"
import { unwrap } from "./report-error"

const INITIAL_PAGE: PageChanged = {
  url: "",
  title: null,
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
  security: "none",
  fullscreen: false,
}

/** The shown tab's page: `get_page` on mount, then every `page-changed`. */
export function usePage() {
  const [page, setPage] = useState(INITIAL_PAGE)

  useEffect(() => {
    // Subscribe before fetching the snapshot so no event slips through in between;
    // an event that arrives first is newer than the snapshot, so it wins.
    let gotEvent = false
    const unlisten = events.pageChanged.listen((event) => {
      gotEvent = true
      setPage(event.payload)
    })
    unwrap("get page", commands.getPage()).then((snapshot) => {
      if (snapshot && !gotEvent) setPage(snapshot)
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  return page
}
