import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Folder as FolderClosedIcon, FolderOpen } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { DraggableTabItem, DropIndicator } from "@/shared/components"
import {
  DROP_ROW,
  INSTANT,
  PEEK_TRANSITION,
  rowIndicator,
  useTabDropZone,
  type Folder,
  type Id,
  type SpaceItem,
} from "@/shared"

// TODO: drop a tab into a folder (Zen: the middle of the folder row; its top and bottom 20% drop
// beside it), reorder inside a folder, drag folders, and right-click > "Create folder". Not built yet.

type FoldersProps = {
  /** The active space's pinned list: folders and standalone tabs, in order. */
  items: SpaceItem[]
  activeTabId: Id | null
  onSelectTab: (tabId: Id) => void
  /** Pinned tabs only unload: they stay in the list, dimmed. */
  onCloseTab: (tabId: Id) => void
  onSetFolderCollapsed: (folderId: Id, collapsed: boolean) => void
  /** A tab is being dragged: an empty list shows where to drop it. */
  dragActive: boolean
  /** The tab being dragged (or just dropped, until the backend moves it). */
  draggedTabId: Id | null
  /** Where a drag would land: the number of top-level items above the line. */
  dropGap: number | null
}

/** The active space's folders and pinned tabs. Open/closed state lives in the backend. */
export function Folders({
  items,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onSetFolderCollapsed,
  dragActive,
  draggedTabId,
  dropGap,
}: FoldersProps) {
  // The whole group takes drops, so the gaps between rows count too.
  const { setNodeRef } = useTabDropZone("pinned", { kind: "pinned" })

  return (
    <SidebarGroup ref={setNodeRef}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item, index) => {
            const indicator = rowIndicator(dropGap, index, items.length)
            return item.kind === "folder" ? (
              <FolderItem
                key={`folder-${item.folder.id}`}
                folder={item.folder}
                onToggle={() => onSetFolderCollapsed(item.folder.id, !item.folder.collapsed)}
                activeTabId={activeTabId}
                onSelectTab={onSelectTab}
                onCloseTab={onCloseTab}
                draggedTabId={draggedTabId}
                indicator={indicator}
              />
            ) : (
              <DraggableTabItem
                key={`tab-${item.tab.id}`}
                tab={item.tab}
                source="pinned"
                active={item.tab.id === activeTabId}
                onSelect={() => onSelectTab(item.tab.id)}
                onClose={() => onCloseTab(item.tab.id)}
                isDragged={item.tab.id === draggedTabId}
                indicator={indicator}
              />
            )
          })}
          {/* Nothing pinned yet: give the drag somewhere to land. */}
          {items.length === 0 && dragActive && (
            <SidebarMenuItem
              className={cn(
                "flex h-8 items-center justify-center rounded-md border border-dashed border-sidebar-foreground/15 text-xs text-sidebar-foreground/45",
                dropGap === 0 && "border-sidebar-primary text-sidebar-foreground/70",
              )}
            >
              Drop here to pin
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

type FolderItemProps = {
  folder: Folder
  onToggle: () => void
  activeTabId: Id | null
  onSelectTab: (tabId: Id) => void
  onCloseTab: (tabId: Id) => void
  draggedTabId: Id | null
  /** A drop line above or below the whole folder. */
  indicator: "top" | "bottom" | null
}

function FolderItem({ folder, onToggle, activeTabId, onSelectTab, onCloseTab, draggedTabId, indicator }: FolderItemProps) {
  const reduceMotion = useReducedMotion()
  const transition = reduceMotion ? INSTANT : PEEK_TRANSITION
  const open = !folder.collapsed
  const Icon = open ? FolderOpen : FolderClosedIcon

  return (
    // One list row with its open tabs: drops go above or below the whole folder.
    <SidebarMenuItem {...DROP_ROW}>
      {indicator && <DropIndicator edge={indicator} />}
      <SidebarMenuButton
        size="sm"
        aria-expanded={open}
        onClick={onToggle}
        className="text-sidebar-foreground/70 [&_svg]:text-sidebar-foreground"
      >
        <Icon aria-hidden />
        <span>{folder.name}</span>
      </SidebarMenuButton>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="tabs"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transition}
            className="overflow-hidden"
          >
            {/* Indented without the default tree line, as in the design. */}
            <SidebarMenuSub className="mx-0 translate-x-0 gap-0 border-l-0 py-0 pr-0 pl-3">
              {folder.tabs.map((tab) => (
                // Can be dragged out of the folder; nothing drops back in yet.
                <DraggableTabItem
                  key={tab.id}
                  sub
                  tab={tab}
                  source="folder"
                  active={tab.id === activeTabId}
                  onSelect={() => onSelectTab(tab.id)}
                  onClose={() => onCloseTab(tab.id)}
                  isDragged={tab.id === draggedTabId}
                />
              ))}
            </SidebarMenuSub>
          </motion.div>
        )}
      </AnimatePresence>
    </SidebarMenuItem>
  )
}
