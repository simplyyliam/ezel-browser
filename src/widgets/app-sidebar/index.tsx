import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
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
import { SpaceDock } from "@/features/app-sidebar/space-dock"
import { SpaceHeader } from "@/features/app-sidebar/space-header"
import { Swatches } from "@/features/app-sidebar/swatches"
import { TempTabs } from "@/features/app-sidebar/temp-tabs"
import { UpdateNote } from "@/features/app-sidebar/update-note"
import { cn } from "@/lib/utils"
import {
  activeSpace,
  cancelDownload,
  clearDownloads,
  hotkeyLabel,
  INSTANT,
  installUpdate,
  NEW_SPACE_ICONS,
  openCommandPalette,
  openDownload,
  PEEK_TRANSITION,
  PERF,
  perfMark,
  reopenClosedTab,
  reportError,
  showDownloadInFolder,
  showToast,
  SPRING,
  unwrap,
  useContentCutout,
  useDownloads,
  useHotkey,
  usePage,
  useReadyUpdate,
  useTabs,
  type Id,
} from "@/shared"
import { commands } from "@/shared/bindings"
import { ScrollArea, type TabRowActions } from "@/shared/components"
import { useSidebarPeek } from "./use-sidebar-peek"
import { TabDragPreview } from "./tab-drag-preview"
import { useTabDrag } from "./use-tab-drag"
import { findTab, showTab, tabMenu } from "./tab-menu"
import { spaceMenu, tabsOf, type SpaceMenuActions } from "./space-menu"
import { useSpaceSwipe } from "./use-space-swipe"

/**
 * docs/design/sidebar-1.png scaled up for legibility (docs/design/decisions.md, "Sizing"):
 * shadcn's 32px rows and 8px group padding, with room for four 45px swatches.
 */
export const SIDEBAR_WIDTH = "244px"

const activateTab = (id: Id) => unwrap("activate tab", commands.activateTab(id))
const closeTab = (id: Id) => unwrap("close tab", commands.closeTab(id))
const removeTab = (id: Id) => unwrap("remove tab", commands.removeTab(id))
const setTabMuted = (id: Id, muted: boolean) => unwrap(muted ? "mute tab" : "unmute tab", commands.setTabMuted(id, muted))
/** Trash-all: the space's temp tabs go on the closed-tab stack; the toast says how to get them back. */
async function clearTempTabs(spaceId: Id, count: number) {
  const done = await unwrap("clear temp tabs", commands.clearTempTabs(spaceId))
  if (done === null) return
  showToast({ title: `Closed ${count} ${count === 1 ? "tab" : "tabs"}`, detail: `${hotkeyLabel("reopenClosedTab")} reopens` })
}
const setSpaceCollapsed = (id: Id, collapsed: boolean) =>
  unwrap(collapsed ? "collapse space" : "expand space", commands.setSpaceCollapsed(id, collapsed))
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
  // Measurement builds: the first frame that shows the backend's tabs.
  useEffect(() => {
    if (PERF && tabs) requestAnimationFrame(() => perfMark("sidebar-ready"))
  }, [tabs])
  const [renamingSpaceId, setRenamingSpaceId] = useState<Id | null>(null)
  // The tab whose name is the address field right now (double-click, "Change URL…", New Tab).
  const [editing, setEditing] = useState<{ tabId: Id; value: string } | null>(null)

  // Rows get callbacks that never change and read the latest state when called, so one tab's
  // change re-renders only its row (DraggableTabItem is memoised; docs/perf/many-tabs.md).
  const latest = useRef({ tabs, space })
  useLayoutEffect(() => {
    latest.current = { tabs, space }
  })

  const editTab = useCallback(async (tabId: Id) => {
    const { tabs } = latest.current
    const tab = tabs && findTab(tabs, tabId)
    if (!tab) return
    // The address loads in the shown tab.
    await showTab(tabs, tabId)
    setEditing({ tabId, value: tab.url })
  }, [])

  const finishEdit = useCallback((input: string | null) => {
    setEditing(null)
    if (input) navigate(input)
  }, [])

  /** A new tab with its name field empty, ready for an address (the URL bar's old job). */
  const startNewTab = useCallback((tabId: Id) => setEditing({ tabId, value: "" }), [])

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

  // Spaces (features/app-sidebar/space-header): commands only; the title row follows `tabs-changed`. The UI state: which space's title is a field, picks an icon, asks to go.
  const [iconPickerSpaceId, setIconPickerSpaceId] = useState<Id | null>(null)
  const [deletingSpaceId, setDeletingSpaceId] = useState<Id | null>(null)

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

  /**
   * The space's menu (its title row). Renaming, picking an icon and the delete question happen at
   * the title; for a space that isn't shown, they show it first.
   */
  const spaceActions: SpaceMenuActions = {
    rename: async (id) => {
      if (id !== space?.id) await switchToSpace(id)
      setRenamingSpaceId(id)
    },
    changeIcon: async (id) => {
      if (id !== space?.id) await switchToSpace(id)
      setIconPickerSpaceId(id)
    },
    setCollapsed: setSpaceCollapsed,
    move: moveSpace,
    unload: unloadSpace,
    delete: async (id) => {
      const target = tabs?.spaces.find((s) => s.id === id)
      if (!target) return
      // An empty space has nothing to lose: no question then.
      if (target.items.length === 0 && target.tempTabs.length === 0) return deleteSpace(id, null)
      if (id !== space?.id) await switchToSpace(id)
      setDeletingSpaceId(id)
    },
  }
  const spaceMenuFor = (id: Id) => {
    const target = tabs?.spaces.find((s) => s.id === id)
    return target && tabs ? spaceMenu(target, tabs.spaces, activeTabId, spaceActions) : []
  }
  const reduceMotion = useReducedMotion()
  const onSpaceSwipe = useSpaceSwipe(tabs?.spaces, space?.id)
  const { open, toggleSidebar } = useSidebar()
  // shadcn's Ctrl+B only hears keys while the UI has focus; this covers the website having it.
  useHotkey("toggleSidebar", toggleSidebar)
  const { peeking, edgeRef, sidebarRef, attachSidebar } = useSidebarPeek(!open)
  // The sidebar shows above the page wherever they overlap; floating, that includes its 1px ring
  // (drawn just outside the card). Docked it sits beside the page, so the hole changes nothing.
  const getSidebarCard = useCallback(
    () => sidebarRef.current?.querySelector<HTMLElement>('[data-slot="sidebar-inner"]') ?? null,
    [sidebarRef],
  )
  useContentCutout("sidebar", getSidebarCard, open ? 0 : 1)
  // Dragging tabs between Swatches, pinned and temp tabs (docs/design/drag-and-drop.md).
  // A dragged tab resting on a folded space's title opens it (spring-loading).
  const tabDrag = useTabDrag({
    tabs,
    space,
    getSidebar: getSidebarCard,
    onSpringOpenSpace: () => {
      const { space } = latest.current
      if (space?.collapsed) setSpaceCollapsed(space.id, false)
    },
  })
  const dropTarget = tabDrag.target

  // Built when the menu opens, from the state at that moment.
  const menuFor = useCallback(
    (tabId: Id) => {
      const { tabs, space } = latest.current
      return tabs && space
        ? tabMenu(tabId, { tabs, activeSpaceId: space.id, onEdit: editTab, onOpened: startNewTab, onFolderCreated: setRenamingFolderId })
        : []
    },
    [editTab, startNewTab],
  )
  // A row's close button. A loaded pinned tab only unloads (back to its pinned URL); once it
  // rests, the same button removes it (onto the closed-tab stack: Ctrl+Shift+T brings it back).
  // Temp tabs are removed either way.
  const closeRow = useCallback((tabId: Id) => {
    const { tabs } = latest.current
    const tab = tabs && findTab(tabs, tabId)
    return tab && !tab.isLoaded ? removeTab(tabId) : closeTab(tabId)
  }, [])
  const rowActions: TabRowActions = {
    activeTabId,
    onSelect: activateTab,
    onClose: closeRow,
    onSetMuted: setTabMuted,
    menuFor,
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
          // Hidden, the card goes a little further than its width: shadcn parks it exactly one width
          // out, which leaves its ring and shadow (drawn outside its box) as a line down the page's edge.
          !open && !peeking && "data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1_-_0.75rem)]!",
          !open && (peeking ? "duration-250 ease-zen-peek" : "duration-(--motion-base) ease-[ease]"),
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
        {/* Swatches and the space's title stay put; the space's pinned list and its temp tabs
            scroll each on their own, sharing the height by how long each is (both shrink in
            proportion). */}
        {/* Two fingers sideways switch spaces (the footer's pill follows). */}
        <div onWheel={onSpaceSwipe} className="flex min-h-0 flex-1 flex-col pt-2">
          {/* Empty until the backend's first snapshot (a few ms after mount). */}
          {tabs && space && (
            <>
              <div className="shrink-0">
              <Swatches
                swatches={tabDrag.swatches}
                activeTabId={activeTabId}
                onSelect={activateTab}
                menuFor={rowActions.menuFor}
                draggedTabId={tabDrag.draggedTabId}
                insertIndex={tabDrag.swatchIndex}
              />
              {/* The shown space's small title row, one button that folds it (see the feature for
                  why). The footer's icons switch spaces. */}
              <SpaceHeader
                space={space}
                spaces={tabs.spaces}
                onToggleCollapsed={() => setSpaceCollapsed(space.id, !space.collapsed)}
                menuFor={spaceMenuFor}
                renaming={space.id === renamingSpaceId}
                onRenameDone={(name) => {
                  setRenamingSpaceId(null)
                  if (name) renameSpace(space.id, name)
                }}
                iconPickerOpen={space.id === iconPickerSpaceId}
                onIconPickerOpenChange={(open) => setIconPickerSpaceId(open ? space.id : null)}
                onPickIcon={(icon) => {
                  setIconPickerSpaceId(null)
                  if (icon !== space.icon) changeSpaceIcon(space.id, icon)
                }}
                deleting={space.id === deletingSpaceId}
                onDeletingChange={(open) => setDeletingSpaceId(open ? space.id : null)}
                onDelete={(moveTo) => {
                  setDeletingSpaceId(null)
                  deleteSpace(space.id, moveTo)
                }}
              />
              </div>
              {/* Keyed by space: switching swaps the whole list instead of animating every folder. */}
              <ScrollArea key={`pinned-${space.id}`}>
                {/* Folded under the title: unfolds on a spring, folds on the peek's ease (as folders
                    do). Folded, nothing shows: the title is the whole space. */}
                <AnimatePresence initial={false}>
                  {!(space.collapsed && space.items.length > 0) && (
                    <motion.div
                      key="pinned"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1, transition: reduceMotion ? INSTANT : SPRING }}
                      exit={{ height: 0, opacity: 0, transition: reduceMotion ? INSTANT : PEEK_TRANSITION }}
                      className="overflow-clip [overflow-clip-margin:2px]"
                    >
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </ScrollArea>
              {/* Keyed by space too (its own key: siblings sharing one keep every visited space mounted),
                  so a switch shows the new list as it is instead of growing every row in. */}
              <TempTabs
                key={`temp-${space.id}`}
                tabs={space.tempTabs}
                actions={rowActions}
                onNewTab={newTab}
                onClear={() => clearTempTabs(space.id, space.tempTabs.length)}
                dropGap={dropTarget?.kind === "temp" ? dropTarget.gap : null}
              />
            </>
          )}
        </div>
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
          onAddSpace={newSpace}
          onAddTab={newTab}
          onAddFolder={newFolder}
          downloads={downloads}
          downloadActions={{ open: openDownload, showInFolder: showDownloadInFolder, cancel: cancelDownload, clear: clearDownloads }}
          center={
            tabs &&
            space && (
              <SpaceDock
                spaces={tabs.spaces}
                activeSpaceId={space.id}
                onSelect={switchToSpace}
                menuFor={spaceMenuFor}
                dropSpaceId={tabDrag.dropSpaceId}
              />
            )
          }
        />
      </SidebarFooter>
    </Sidebar>
    </>
  )
}
