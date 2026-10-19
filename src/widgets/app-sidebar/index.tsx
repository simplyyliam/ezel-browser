import { useCallback, useEffect, useRef, useState } from "react"
import { DndContext } from "@dnd-kit/core"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { BottomActions } from "@/features/app-sidebar/bottom-actions"
import { SidebarContextMenu } from "@/features/app-sidebar/context-menu"
import { Folders } from "@/features/app-sidebar/folders"
import { Navigation } from "@/features/app-sidebar/navigation"
import { SpaceSwitcher } from "@/features/app-sidebar/space-switcher"
import { Swatches } from "@/features/app-sidebar/swatches"
import { TempTabs } from "@/features/app-sidebar/temp-tabs"
import { UrlBar, type UrlBarHandle } from "@/features/app-sidebar/url-bar"
import { cn } from "@/lib/utils"
import {
  activateTab,
  activeSpace,
  clearTempTabs,
  closeTab,
  createSpace,
  getPage,
  NEW_SPACE_ICONS,
  onPageChanged,
  onToggleSidebar,
  openTab,
  setFolderCollapsed,
  switchSpace,
  updateSpace,
  useContentCutout,
  useTabs,
  type Id,
  type PageChanged,
} from "@/shared"
import { ScrollArea } from "@/shared/components"
import { useSidebarPeek } from "./use-sidebar-peek"
import { TabDragPreview } from "./tab-drag-preview"
import { useTabDrag } from "./use-tab-drag"

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
  // Tab, folder and space data come only from the backend mirror; actions are commands whose
  // result returns through `tabs-changed`.
  const tabs = useTabs()
  const space = tabs ? activeSpace(tabs) : undefined
  const activeTabId = tabs?.activeTabId ?? null
  const urlBarRef = useRef<UrlBarHandle>(null)
  const [renamingSpaceId, setRenamingSpaceId] = useState<Id | null>(null)

  async function newTab() {
    await openTab()
    urlBarRef.current?.focusEmpty()
  }

  async function newSpace() {
    if (!tabs) return
    const count = tabs.spaces.length
    const id = await createSpace(`Space ${count + 1}`, NEW_SPACE_ICONS[(count - 1) % NEW_SPACE_ICONS.length])
    await switchSpace(id)
    setRenamingSpaceId(id)
  }
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
  const getSidebarCard = useCallback(
    () => sidebarRef.current?.querySelector<HTMLElement>('[data-slot="sidebar-inner"]') ?? null,
    [sidebarRef],
  )
  useContentCutout("sidebar", getSidebarCard, open ? 0 : 1)
  // Dragging tabs between Swatches, pinned and temp tabs (docs/design/drag-and-drop.md).
  const tabDrag = useTabDrag({ tabs, space, getSidebar: getSidebarCard })
  const dropTarget = tabDrag.target

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
          // The sidebar variant's divider line isn't wanted either. No padding in either variant:
          // the card runs to the top, bottom and left of the browser area like the docked panel.
          "absolute h-full p-0 group-data-[side=left]:border-r-0",
          // Without the floating padding the card sits in the frame's corners, so it takes the frame's
          // radius (important: shadcn's floating rounded-lg is set on the inner element by a group variant).
          !open && "[&>[data-slot=sidebar-inner]]:rounded-frame!",
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
        <UrlBar ref={urlBarRef} url={page.url} isLoading={page.isLoading} />
      </SidebarHeader>

      {/* Right-clicking the sidebar body opens Zen's sidebar menu. */}
      <SidebarContextMenu onNewTab={newTab} onNewSpace={newSpace} className="flex min-h-0 flex-1 flex-col">
      <SidebarContent className="gap-0 overflow-hidden">
        <DndContext {...tabDrag.context}>
        <ScrollArea className="flex-1" viewportClassName="pt-2">
          {/* Empty until the backend's first snapshot (a few ms after mount). */}
          {tabs && space && (
            <>
              <Swatches
                swatches={tabs.swatches}
                activeTabId={activeTabId}
                onSelect={activateTab}
                draggedTabId={tabDrag.draggedTabId}
                dropSlot={dropTarget?.kind === "swatch" ? dropTarget.slot : null}
              />
              <SpaceSwitcher
                spaces={tabs.spaces}
                activeSpaceId={space.id}
                onSelect={switchSpace}
                renamingSpaceId={renamingSpaceId}
                onRenamingChange={setRenamingSpaceId}
                onRename={(id, name) => updateSpace(id, name)}
                dropSpaceId={tabDrag.dropSpaceId}
              />
              {/* Keyed by space: switching swaps the whole list instead of animating every folder. */}
              <Folders
                key={space.id}
                items={space.items}
                activeTabId={activeTabId}
                onSelectTab={activateTab}
                onCloseTab={closeTab}
                onSetFolderCollapsed={setFolderCollapsed}
                dragActive={tabDrag.dragActive}
                draggedTabId={tabDrag.draggedTabId}
                dropGap={dropTarget?.kind === "pinned" ? dropTarget.gap : null}
              />
              <TempTabs
                tabs={space.tempTabs}
                activeTabId={activeTabId}
                onSelect={activateTab}
                onClose={closeTab}
                onNewTab={newTab}
                draggedTabId={tabDrag.draggedTabId}
                dropGap={dropTarget?.kind === "temp" ? dropTarget.gap : null}
              />
            </>
          )}
        </ScrollArea>
        {tabDrag.drag && (
          <TabDragPreview
            drag={tabDrag.drag}
            shape={tabDrag.shape}
            returning={tabDrag.returning}
            canReturn={tabDrag.canReturn}
            onReturned={tabDrag.onReturned}
            getSidebar={getSidebarCard}
          />
        )}
        </DndContext>
      </SidebarContent>
      </SidebarContextMenu>

      <SidebarFooter>
        <BottomActions
          hasTempTabs={(space?.tempTabs.length ?? 0) > 0}
          onTrashAll={() => space && clearTempTabs(space.id)}
          onAddSpace={newSpace}
          onAddTab={newTab}
        />
      </SidebarFooter>
    </Sidebar>
    </>
  )
}
