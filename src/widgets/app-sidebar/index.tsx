import { useEffect, useState } from "react"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar"
import { BottomActions } from "@/features/app-sidebar/bottom-actions"
import { Folders } from "@/features/app-sidebar/folders"
import { Navigation } from "@/features/app-sidebar/navigation"
import {
  PLACEHOLDER_ACTIVE_TAB_ID,
  PLACEHOLDER_SPACES,
  PLACEHOLDER_SWATCHES,
  PLACEHOLDER_TEMP_TABS,
} from "@/features/app-sidebar/placeholder-data"
import { SpaceSwitcher } from "@/features/app-sidebar/space-switcher"
import { Swatches } from "@/features/app-sidebar/swatches"
import { TempTabs } from "@/features/app-sidebar/temp-tabs"
import { UrlBar } from "@/features/app-sidebar/url-bar"
import { getPage, onPageChanged, type PageChanged } from "@/shared"
import { SidebarToggle } from "@/shared/components"

/**
 * From docs/design/sidebar-1.png (a 1.5x export): 4 swatches of 45px + 3 gaps of 4px = 192px,
 * plus 10px padding each side (the sections' px-2.5) = 212px.
 */
export const SIDEBAR_WIDTH = "212px"

const INITIAL_PAGE: PageChanged = {
  url: "",
  title: null,
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
}

function usePage() {
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

  return page
}

/**
 * The left sidebar. Positioned against the area below the titlebar (absolute, not shadcn's
 * viewport-fixed default), with no padding of its own: the window frame's p-1 is the only gap. The website webview is drawn over everything right of the sidebar,
 * so nothing here may float past its right edge.
 */
export function AppSidebar() {
  const page = usePage()
  const [activeSpaceId, setActiveSpaceId] = useState(PLACEHOLDER_SPACES[0].id)
  const space = PLACEHOLDER_SPACES.find((s) => s.id === activeSpaceId) ?? PLACEHOLDER_SPACES[0]

  return (
    <Sidebar variant="inset" collapsible="offcanvas" className="absolute h-full p-0">
      {/* TODO: temporary block; removed when the command palette lands. */}
      <SidebarHeader className="gap-1.5 px-2.5 pt-2.5 pb-0">
        <div className="flex items-center gap-0.5">
          <SidebarToggle />
          <Navigation canGoBack={page.canGoBack} canGoForward={page.canGoForward} />
        </div>
        <UrlBar url={page.url} isLoading={page.isLoading} />
      </SidebarHeader>

      <SidebarContent className="gap-0 px-2.5 pt-3">
        <Swatches swatches={PLACEHOLDER_SWATCHES} />
        <div className="mt-5">
          <SpaceSwitcher spaces={PLACEHOLDER_SPACES} activeSpaceId={space.id} onSelect={setActiveSpaceId} />
        </div>
        <div className="mt-3.5">
          {/* Keyed by space: folder open state and the active tab start fresh per space. */}
          <Folders key={space.id} items={space.items} defaultActiveTabId={PLACEHOLDER_ACTIVE_TAB_ID} />
        </div>
        <TempTabs tabs={PLACEHOLDER_TEMP_TABS} />
      </SidebarContent>

      <SidebarFooter className="px-2.5 pt-2 pb-2.5">
        <BottomActions />
      </SidebarFooter>
    </Sidebar>
  )
}
