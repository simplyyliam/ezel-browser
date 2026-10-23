import { useState } from "react"
import { ContentSlot } from "@/features/browser-view/content-slot"
import { ErrorPage } from "@/features/browser-view/error-page"
import { FindBar } from "@/features/browser-view/find-bar"
import { PageMenu } from "@/features/browser-view/page-menu"
import {
  findInPage,
  findNext,
  openCommandPalette,
  siteHost,
  stopFinding,
  unwrap,
  useFindResults,
  useHotkey,
  usePage,
  useTabs,
  type Id,
} from "@/shared"
import { commands } from "@/shared/bindings"
import { usePageMenu } from "@/shared/page-menu"

/** The browser view: the area the website fills, the page's right-click menu and find in page. */
export function BrowserView() {
  const { menu, close } = usePageMenu()
  const tabs = useTabs()
  const page = usePage()
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
      {/* The website couldn't be shown: Ezel's page in its place (its webview is hidden). */}
      {page.error && (
        <ErrorPage
          error={page.error}
          host={siteHost(page.url)}
          canGoBack={page.canGoBack}
          onTryAgain={() => unwrap("try again", commands.reload())}
          onChangeAddress={() => openCommandPalette("current-tab")}
          onGoBack={() => unwrap("go back", commands.goBack())}
        />
      )}
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
