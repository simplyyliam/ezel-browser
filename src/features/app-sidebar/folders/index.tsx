import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Folder as FolderClosedIcon, FolderOpen } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { TabRow } from "@/shared/components"
import { INSTANT, PEEK_TRANSITION, type Folder, type Id, type SpaceItem } from "@/shared"

// TODO: drag a tab onto a folder, and right-click > "Create folder". Not built yet.

type FoldersProps = {
  /** The active space's pinned list: folders and standalone tabs, in order. */
  items: SpaceItem[]
  activeTabId: Id | null
  onSelectTab: (tabId: Id) => void
  /** Pinned tabs only unload: they stay in the list, dimmed. */
  onCloseTab: (tabId: Id) => void
  onSetFolderCollapsed: (folderId: Id, collapsed: boolean) => void
}

/** The active space's folders and pinned tabs. Open/closed state lives in the backend. */
export function Folders({ items, activeTabId, onSelectTab, onCloseTab, onSetFolderCollapsed }: FoldersProps) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) =>
            item.kind === "folder" ? (
              <FolderItem
                key={`folder-${item.folder.id}`}
                folder={item.folder}
                onToggle={() => onSetFolderCollapsed(item.folder.id, !item.folder.collapsed)}
                activeTabId={activeTabId}
                onSelectTab={onSelectTab}
                onCloseTab={onCloseTab}
              />
            ) : (
              <SidebarMenuItem key={`tab-${item.tab.id}`}>
                <TabRow
                  tab={item.tab}
                  active={item.tab.id === activeTabId}
                  onSelect={() => onSelectTab(item.tab.id)}
                  onClose={() => onCloseTab(item.tab.id)}
                />
              </SidebarMenuItem>
            ),
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
}

function FolderItem({ folder, onToggle, activeTabId, onSelectTab, onCloseTab }: FolderItemProps) {
  const reduceMotion = useReducedMotion()
  const transition = reduceMotion ? INSTANT : PEEK_TRANSITION
  const open = !folder.collapsed
  const Icon = open ? FolderOpen : FolderClosedIcon

  return (
    <SidebarMenuItem>
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
                <SidebarMenuSubItem key={tab.id}>
                  <TabRow
                    tab={tab}
                    active={tab.id === activeTabId}
                    onSelect={() => onSelectTab(tab.id)}
                    onClose={() => onCloseTab(tab.id)}
                  />
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </motion.div>
        )}
      </AnimatePresence>
    </SidebarMenuItem>
  )
}
