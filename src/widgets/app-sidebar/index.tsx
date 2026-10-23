import { useCallback, useState } from "react"
import { DndContext, DragOverlay } from "@dnd-kit/core"
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
import { Folders, type FolderActions } from "@/features/app-sidebar/folders"
import { Navigation } from "@/features/app-sidebar/navigation"
import { SpaceSwitcher } from "@/features/app-sidebar/space-switcher"
import { Swatches } from "@/features/app-sidebar/swatches"
import { TempTabs } from "@/features/app-sidebar/temp-tabs"
import { UpdateNote } from "@/features/app-sidebar/update-note"
import { cn } from "@/lib/utils"
import {
  activeSpace,
  cancelDownload,
  clearDownloads,
  installUpdate,
  NEW_SPACE_ICONS,
  openCommandPalette,
  openDownload,
  reopenClosedTab,
  reportError,
  showDownloadInFolder,
  showToast,
  unwrap,
  useContentCutout,
  useDownloads,
  useHotkey,
  usePage,
  useReadyUpdate,
  useTabs,
  type Id,
  type Space,
} from "@/shared"
import { commands } from "@/shared/bindings"
import { ScrollArea, type TabRowActions } from "@/shared/components"
import { useLoadMeter } from "./use-load-meter"
import { useSidebarPeek } from "./use-sidebar-peek"
import { TabDragPreview } from "./tab-drag-preview"
import { useTabDrag } from "./use-tab-drag"
import { findTab, showTab, tabMenu } from "./tab-menu"

/**
 * docs/design/sidebar-1.png scaled up for legibility (docs/design/decisions.md, "Sizing"):
 * shadcn's 32px rows and 8px group padding, with room for four 45px swatches.
 */
export const SIDEBAR_WIDTH = "244px"

const activateTab = (id: Id) => unwrap("activate tab", commands.activateTab(id))
const closeTab = (id: Id) => unwrap("close tab", commands.closeTab(id))
const setTabMuted = (id: Id, muted: boolean) => unwrap(muted ? "mute tab" : "unmute tab", commands.setTabMuted(id, muted))
const clearTempTabs = (spaceId: Id) => unwrap("clear temp tabs", commands.clearTempTabs(spaceId))
/** The tab name's address field. A local or code address (file:, javascript:…) is refused by Rust; say so. */
async function navigate(input: string) {
  try {
    const result = await commands.navigate(input)
    if (result.status === "error") {
      if (result.error.code === "invalid_input") showToast({ title: "Only web addresses can be opened", tone: "info" })
      else reportError("navigate", result.error)
    }
  } catch (error) {
    reportError("navigate", error)
  }
}
const setFolderCollapsed = (id: Id, collapsed: boolean) =>
  unwrap("set folder collapsed", commands.setFolderCollapsed(id, collapsed))

/** What a new folder is called until it's renamed (it opens with its name as a field). */
const NEW_FOLDER_NAME = "New Folder"

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
  // A new version downloaded in the background, waiting for a restart (release builds).
  const readyUpdate = useReadyUpdate()
  const downloads = useDownloads()
  // Tab, folder and space data come only from the backend mirror; actions are commands whose
  // result returns through `tabs-changed`.
  const tabs = useTabs()
  const space = tabs ? activeSpace(tabs) : undefined
  const activeTabId = tabs?.activeTabId ?? null
  const [renamingSpaceId, setRenamingSpaceId] = useState<Id | null>(null)
  // The tab whose name is the address field right now (double-click, "Change URL…", New Tab).
  const [editing, setEditing] = useState<{ tabId: Id; value: string } | null>(null)

  async function editTab(tabId: Id) {
    const tab = tabs && findTab(tabs, tabId)
    if (!tab) return
    // The address loads in the shown tab.
    await showTab(tabs, tabId)
    setEditing({ tabId, value: tab.url })
  }

  function finishEdit(input: string | null) {
    setEditing(null)
    if (input) navigate(input)
  }

  /** A new tab with its name field empty, ready for an address (the URL bar's old job). */
  const startNewTab = (tabId: Id) => setEditing({ tabId, value: "" })

  /** New Tab asks where to go first (the command palette), so no blank page is ever opened. */
  const newTab = () => openCommandPalette("new-tab")

  // Folders (features/app-sidebar/folders): commands only; a new folder's name opens as a field.
  const [renamingFolderId, setRenamingFolderId] = useState<Id | null>(null)

  /** New Folder (sidebar menu, + menu): at the end of the shown space's pinned list. */
  async function newFolder() {
    if (!space) return
    const id = await unwrap("create folder", commands.createFolder(space.id, NEW_FOLDER_NAME, null))
    if (id !== null) setRenamingFolderId(id)
  }

  const folderActions: FolderActions = {
    setCollapsed: setFolderCollapsed,
    startRename: setRenamingFolderId,
    finishRename: (id, name) => {
      setRenamingFolderId(null)
      const folder = space?.items.find((item) => item.kind === "folder" && item.folder.id === id)
      if (name && folder?.kind === "folder" && name !== folder.folder.name) unwrap("rename folder", commands.renameFolder(id, name))
    },
    newTabIn: async (id) => {
      if (!space) return
      const tabId = await unwrap("open tab", commands.openTab(null))
      if (tabId === null) return
      await unwrap("open folder", commands.setFolderCollapsed(id, false))
      await unwrap("place new tab", commands.moveTab(tabId, { kind: "pinned", spaceId: space.id, folderId: id, index: null }))
      startNewTab(tabId)
    },
    unload: (id) => unwrap("unload folder", commands.unloadFolder(id)),
    moveToSpace: (id, spaceId) => unwrap("move folder", commands.moveFolder(id, spaceId, null)),
    unpack: (id) => unwrap("unpack folder", commands.deleteFolder(id, true)),
    remove: (id) => unwrap("delete folder", commands.deleteFolder(id, false)),
  }

  // Spaces (features/app-sidebar/space-switcher): commands only; the list and titles follow `tabs-changed`.
  const [spaceListOpen, setSpaceListOpen] = useState(false)

  async function newSpace() {
    if (!tabs) return
    const count = tabs.spaces.length
    const icon = NEW_SPACE_ICONS[(count - 1) % NEW_SPACE_ICONS.length]
    const id = await unwrap("create space", commands.createSpace(`Space ${count + 1}`, icon))
    if (id === null) return
    await unwrap("switch space", commands.switchSpace(id))
    // A new space's first job is a name: its title opens as a field.
    setRenamingSpaceId(id)
  }

  const switchToSpace = (id: Id) => unwrap("switch space", commands.switchSpace(id))
  const renameSpace = (id: Id, name: string) => unwrap("rename space", commands.updateSpace(id, name, null))
  const changeSpaceIcon = (id: Id, icon: string) => unwrap("change space icon", commands.updateSpace(id, null, icon))
  const moveSpace = (id: Id, index: number) => unwrap("move space", commands.moveSpace(id, index))
  const deleteSpace = (id: Id, moveTo: Id | null) => unwrap("delete space", commands.deleteSpace(id, moveTo))

  /** Frees every loaded tab of the space but the one on screen (HIG: don't take away what people look at). */
  function unloadSpace(id: Id) {
    const target = tabs?.spaces.find((s) => s.id === id)
    if (!target) return
    for (const tab of tabsOf(target)) {
      if (tab.isLoaded && tab.id !== activeTabId) unwrap("unload space", commands.unloadTab(tab.id))
    }
  }
  const { open, toggleSidebar } = useSidebar()
  // shadcn's Ctrl+B only hears keys while the UI has focus; this covers the website having it.
  useHotkey("toggleSidebar", toggleSidebar)
  const { peeking, edgeRef, sidebarRef, attachSidebar } = useSidebarPeek(!open)
  // Read only while the sidebar can be seen: docked, or peeking over the page.
  const load = useLoadMeter(open || peeking, tabs)
  // The sidebar shows above the page wherever they overlap; floating, that includes its 1px ring
  // (drawn just outside the card). Docked it sits beside the page, so the hole changes nothing.
  const getSidebarCard = useCallback(
    () => sidebarRef.current?.querySelector<HTMLElement>('[data-slot="sidebar-inner"]') ?? null,
    [sidebarRef],
  )
  useContentCutout("sidebar", getSidebarCard, open ? 0 : 1)
  // Dragging tabs between Swatches, pinned and temp tabs (docs/design/drag-and-drop.md).
  const tabDrag = useTabDrag({ tabs, space, getSidebar: getSidebarCard, onSpaceListOpen: setSpaceListOpen })
  const dropTarget = tabDrag.target

  const rowActions: TabRowActions = {
    activeTabId,
    onSelect: activateTab,
    onClose: closeTab,
    onSetMuted: setTabMuted,
    menuFor: (tabId) =>
      tabs && space
        ? tabMenu(tabId, { tabs, activeSpaceId: space.id, onEdit: editTab, onOpened: startNewTab, onFolderCreated: setRenamingFolderId })
        : [],
    editing,
    onEdit: editTab,
    onEditDone: finishEdit,
    draggedTabId: tabDrag.draggedTabId,
  }

  return (
    <>
      {/* The window's left edge (the frame's padding, the only UI the website doesn't cover there) opens the peek. */}
      <div ref={edgeRef} aria-hidden className="fixed inset-y-0 left-0 z-20 w-1" />
      <Sidebar
        ref={attachSidebar}
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
          // Collapsed, the card is its own GPU layer: drawn once, then only moved while it slides.
          // Repainted every frame instead, it fell behind its hole after a launch or a restore,
          // and the hole showed Ezel's dark background ahead of it (a ghost).
          !open && "will-change-transform",
        )}
      >
      {/* The address lives in the tab's name (double-click it); loading shows on the tab's icon. */}
      <SidebarHeader className="pb-0">
        <div className="flex items-center gap-0.5">
          <SidebarTrigger />
          <Navigation canGoBack={page.canGoBack} canGoForward={page.canGoForward} />
        </div>
      </SidebarHeader>

      {/* Right-clicking empty sidebar space opens the sidebar's menu (catalog area "sidebar"). */}
      <SidebarContextMenu
        onNewTab={newTab}
        onNewFolder={newFolder}
        closedCount={tabs?.closedCount ?? 0}
        onReopenClosedTab={reopenClosedTab}
        className="flex min-h-0 flex-1 flex-col"
      >
      <SidebarContent className="gap-0 overflow-hidden">
        <DndContext {...tabDrag.context}>
        <ScrollArea className="flex-1" viewportClassName="pt-2">
          {/* Empty until the backend's first snapshot (a few ms after mount). */}
          {tabs && space && (
            <>
              <Swatches
                swatches={tabDrag.swatches}
                activeTabId={activeTabId}
                onSelect={activateTab}
                menuFor={rowActions.menuFor}
                draggedTabId={tabDrag.draggedTabId}
                insertIndex={tabDrag.swatchIndex}
              />
              {/* The shown space's title: a pop-up button over its own tabs (see the feature for why). */}
              <SpaceSwitcher
                spaces={tabs.spaces}
                activeSpaceId={space.id}
                shownTabId={activeTabId}
                onSelect={switchToSpace}
                onCreate={newSpace}
                onRename={renameSpace}
                onChangeIcon={changeSpaceIcon}
                onMove={moveSpace}
                onUnload={unloadSpace}
                onDelete={deleteSpace}
                renamingSpaceId={renamingSpaceId}
                onRenamingChange={setRenamingSpaceId}
                listOpen={spaceListOpen}
                onListOpenChange={setSpaceListOpen}
                dropSpaceId={tabDrag.dropSpaceId}
              />
              {/* Keyed by space: switching swaps the whole list instead of animating every folder. */}
              <Folders
                key={space.id}
                items={space.items}
                spaces={tabs.spaces}
                spaceId={space.id}
                actions={rowActions}
                folderActions={folderActions}
                renamingFolderId={renamingFolderId}
                dropGap={dropTarget?.kind === "pinned" ? dropTarget.gap : null}
                dropFolder={dropTarget?.kind === "folder" ? dropTarget : null}
              />
              <TempTabs
                tabs={space.tempTabs}
                actions={rowActions}
                onNewTab={newTab}
                dropGap={dropTarget?.kind === "temp" ? dropTarget.gap : null}
              />
            </>
          )}
        </ScrollArea>
        {/* Invisible: it gives dnd-kit a dragged rect that survives the source unmounting (a space
            switch hides list sources, the grid replaces a dragged swatch with its gap). Without
            it, dnd-kit stops finding drop zones. What the user sees is TabDragPreview. */}
        <DragOverlay dropAnimation={null} className="pointer-events-none opacity-0">
          {tabDrag.drag && <div className="size-full" />}
        </DragOverlay>
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
        {readyUpdate && <UpdateNote version={readyUpdate} onRestart={installUpdate} />}
        <BottomActions
          hasTempTabs={(space?.tempTabs.length ?? 0) > 0}
          onTrashAll={() => space && clearTempTabs(space.id)}
          onAddSpace={newSpace}
          onAddTab={newTab}
          onAddFolder={newFolder}
          downloads={downloads}
          downloadActions={{ open: openDownload, showInFolder: showDownloadInFolder, cancel: cancelDownload, clear: clearDownloads }}
          load={load}
        />
      </SidebarFooter>
    </Sidebar>
    </>
  )
}

/** Every tab a space holds: pinned, in folders, temp. */
function tabsOf(space: Space) {
  return [...space.items.flatMap((item) => (item.kind === "tab" ? [item.tab] : item.folder.tabs)), ...space.tempTabs]
}
