import { useEffect, useState } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
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
import { cn } from "@/lib/utils"
import { getPage, onPageChanged, onToggleSidebar, useContentCutout, type PageChanged } from "@/shared"
import { ScrollArea } from "@/shared/components"
import { useSidebarPeek } from "./use-sidebar-peek"

/**
 * docs/design/sidebar-1.png scaled up for legibility (docs/design/decisions.md, "Sizing"):
 * shadcn's 32px rows and 8px group padding, with room for four ~54px swatches.
 */
export const SIDEBAR_WIDTH = "244px"

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
 * The left sidebar: shadcn's floating card, positioned against the area below the titlebar
 * (absolute, not shadcn's viewport-fixed default). Open (Ctrl+B) it's docked beside the page.
 * Collapsed, it works like Zen's compact mode ("Only Sidebar" layout): hovering the window's left
 * edge peeks it out over the page. See docs/design/decisions.md, "Sidebar peek".
 * The website webview is drawn over all UI: the card is cut out of it, and nothing here may float
 * past the card's right edge.
 */
export function AppSidebar() {
  const page = usePage()
  const [activeSpaceId, setActiveSpaceId] = useState(PLACEHOLDER_SPACES[0].id)
  const space = PLACEHOLDER_SPACES.find((s) => s.id === activeSpaceId) ?? PLACEHOLDER_SPACES[0]
  const { open, toggleSidebar } = useSidebar()
  // shadcn's Ctrl+B only hears keys while the UI has focus; this covers the website having it.
  useEffect(() => {
    const unlisten = onToggleSidebar(toggleSidebar)
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [toggleSidebar])
  const { peeking, edgeRef, sidebarRef } = useSidebarPeek(!open)
  // The sidebar shows above the page wherever they overlap; floating, that includes its 1px ring
  // (drawn just outside the card). Docked it sits beside the page, so the hole changes nothing.
  useContentCutout(
    "sidebar",
    () => sidebarRef.current?.querySelector<HTMLElement>('[data-slot="sidebar-inner"]') ?? null,
    open ? 0 : 1,
  )

  return (
    <>
      {/* The window's left edge (the frame's padding, the only UI the website doesn't cover there) opens the peek. */}
      <div ref={edgeRef} aria-hidden className="fixed inset-y-0 left-0 z-20 w-1" />
      <Sidebar
        ref={sidebarRef}
        // Docked (open): a flat panel flush in the frame, whose p-1 is the only gap. No padding,
        // radius, ring or shadow. Collapsed/peeking: Zen's floating card.
        variant={open ? "sidebar" : "floating"}
        collapsible="offcanvas"
        // Out of the tab order and the accessibility tree while it's hidden off-canvas.
        inert={!open && !peeking}
        className={cn(
          // The sidebar variant's divider line isn't wanted either.
          "absolute h-full group-data-[side=left]:border-r-0",
          // Peeking slides the collapsed card back in, over the page. Zen: in 0.25s on its spring curve, out 0.15s ease.
          peeking && "data-[side=left]:group-data-[collapsible=offcanvas]:left-0",
          !open && (peeking ? "duration-250 ease-zen-peek" : "duration-150 ease-[ease]"),
        )}
      >
      {/* TODO: temporary block; removed when the command palette lands. */}
      <SidebarHeader className="pb-0">
        <div className="flex items-center gap-0.5">
          <SidebarTrigger />
          <Navigation canGoBack={page.canGoBack} canGoForward={page.canGoForward} />
        </div>
        <UrlBar url={page.url} isLoading={page.isLoading} />
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-hidden">
        <ScrollArea className="flex-1" viewportClassName="pt-2">
          <Swatches swatches={PLACEHOLDER_SWATCHES} />
          <SpaceSwitcher spaces={PLACEHOLDER_SPACES} activeSpaceId={space.id} onSelect={setActiveSpaceId} />
          {/* Keyed by space: folder open state and the active tab start fresh per space. */}
          <Folders key={space.id} items={space.items} defaultActiveTabId={PLACEHOLDER_ACTIVE_TAB_ID} />
          <TempTabs tabs={PLACEHOLDER_TEMP_TABS} />
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter>
        <BottomActions />
      </SidebarFooter>
    </Sidebar>
    </>
  )
}
