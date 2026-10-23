import { useState } from "react"
import { ContentSlot } from "@/features/browser-view/content-slot"
import { FindBar } from "@/features/browser-view/find-bar"
import { PageMenu } from "@/features/browser-view/page-menu"
import { findInPage, findNext, stopFinding, useFindResults, useHotkey, useTabs, type Id } from "@/shared"
import { usePageMenu } from "@/shared/page-menu"

/** The browser view: the area the website fills, the page's right-click menu and find in page. */
export function BrowserView() {
  const { menu, close } = usePageMenu()
  const tabs = useTabs()
  const activeTabId = tabs?.activeTabId ?? null
  // Find belongs to the tab it was opened on: showing another tab closes it.
  const [find, setFind] = useState<{ tabId: Id; focusKey: number } | null>(null)
  const findOpen = find !== null && find.tabId === activeTabId
  const results = useFindResults(findOpen)
  // Adjusted while rendering (React's pattern for state that follows a prop): the bar unmounts
  // and ends the session.
  if (find !== null && find.tabId !== activeTabId) setFind(null)

  useHotkey("find", () => {
    if (activeTabId === null) return
    setFind((current) => ({ tabId: activeTabId, focusKey: (current?.focusKey ?? 0) + 1 }))
  })

  return (
    // Inherits the sidebar inset's corners (they change with the sidebar's state); the slot passes them on to the website's clip.
    <div className="relative flex min-h-0 flex-1 flex-col rounded-[inherit]">
      <ContentSlot className="rounded-[inherit]" />
      {findOpen && (
        <FindBar
          results={results}
          focusKey={find.focusKey}
          onQuery={findInPage}
          onNext={findNext}
          onClose={(refocus) => {
            setFind(null)
            stopFinding(refocus)
          }}
        />
      )}
      {/* Keyed per right-click: each one is a fresh menu. */}
      {menu && <PageMenu key={menu.id} menu={menu} onClose={close} />}
    </div>
  )
}
