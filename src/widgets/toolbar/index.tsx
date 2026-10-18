import { useEffect, useState } from "react"
import { LoadingIndicator } from "@/features/toolbar/loading-indicator"
import { Navigation } from "@/features/toolbar/navigation"
import { UrlBar } from "@/features/toolbar/url-bar"
import { getPage, onPageChanged, type PageChanged } from "@/shared"

const INITIAL_PAGE: PageChanged = {
  url: "",
  title: null,
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
}

/** The 48px strip at the top of the window. */
export function Toolbar() {
  const [page, setPage] = useState(INITIAL_PAGE)

  useEffect(() => {
    // Subscribe before fetching the snapshot so no event slips through in between;
    // an event that arrives first is newer than the snapshot, so it wins.
    let gotEvent = false
    const unlisten = onPageChanged((next) => {
      gotEvent = true
      setPage(next)
    })
    getPage().then((snapshot) => {
      if (!gotEvent) setPage(snapshot)
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  return (
    <header className="flex h-12 items-center gap-2 border-b px-2">
      <Navigation canGoBack={page.canGoBack} canGoForward={page.canGoForward} />
      <div className="relative min-w-0 flex-1">
        <UrlBar url={page.url} className="pr-9" />
        <LoadingIndicator
          isLoading={page.isLoading}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
        />
      </div>
    </header>
  )
}
