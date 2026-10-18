import { useState } from "react"
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
import { INSTANT, PEEK_TRANSITION, type Folder, type SpaceItem } from "@/shared"

// TODO: drag a tab onto a folder, and right-click > "Create folder". Not built yet.

type FoldersProps = {
  /** The active space's list: folders and standalone tabs, in order. */
  items: SpaceItem[]
  defaultActiveTabId?: string
}

/** The active space's folders and tabs. Folder open state and the active tab are local for now. */
export function Folders({ items, defaultActiveTabId }: FoldersProps) {
  const [activeTabId, setActiveTabId] = useState(defaultActiveTabId)
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())

  const toggle = (folderId: string) =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (!next.delete(folderId)) next.add(folderId)
      return next
    })

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) =>
            item.kind === "folder" ? (
              <FolderItem
                key={item.folder.id}
                folder={item.folder}
                open={!closed.has(item.folder.id)}
                onToggle={() => toggle(item.folder.id)}
                activeTabId={activeTabId}
                onSelectTab={setActiveTabId}
              />
            ) : (
              <SidebarMenuItem key={item.tab.id}>
                <TabRow
                  tab={item.tab}
                  active={item.tab.id === activeTabId}
                  onSelect={() => setActiveTabId(item.tab.id)}
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
  open: boolean
  onToggle: () => void
  activeTabId: string | undefined
  onSelectTab: (tabId: string) => void
}

function FolderItem({ folder, open, onToggle, activeTabId, onSelectTab }: FolderItemProps) {
  const reduceMotion = useReducedMotion()
  const transition = reduceMotion ? INSTANT : PEEK_TRANSITION
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
                  <TabRow tab={tab} active={tab.id === activeTabId} onSelect={() => onSelectTab(tab.id)} />
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </motion.div>
        )}
      </AnimatePresence>
    </SidebarMenuItem>
  )
}
