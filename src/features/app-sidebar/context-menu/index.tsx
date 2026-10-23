import type { ReactNode } from "react"
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useSidebar } from "@/components/ui/sidebar"
import { menuLabel } from "@/shared"

// The sidebar's own menu (catalog area "sidebar", shared/menus/catalog.ts): the sidebar itself and
// making things in the shown space. Item-level menus (tab, swatch, space) come with those items;
// New Space lives in the spaces list and the + menu. Items whose feature isn't built yet are left
// out, not shown dead (HIG context-menus.md).
// TODO: "Edit Theme…" once the theme editor exists.

type SidebarContextMenuProps = {
  /** The area that opens the menu on right-click. */
  children: ReactNode
  onNewTab: () => void
  /** A folder at the end of the shown space's pinned list, its name ready to type. */
  onNewFolder: () => void
  /** Closed tabs Reopen Closed Tab can bring back; 0 hides the item. */
  closedCount: number
  onReopenClosedTab: () => void
  className?: string
}

export function SidebarContextMenu({ children, onNewTab, onNewFolder, closedCount, onReopenClosedTab, className }: SidebarContextMenuProps) {
  const { open, setOpen } = useSidebar()

  return (
    <ContextMenu>
      <ContextMenuTrigger className={className}>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {/* Compact mode = the collapsed sidebar that peeks from the left edge; off = docked. */}
        <ContextMenuCheckboxItem checked={!open} onCheckedChange={(compact) => setOpen(!compact)}>
          {menuLabel("sidebar", "compactMode")}
        </ContextMenuCheckboxItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onNewTab}>{menuLabel("sidebar", "newTab")}</ContextMenuItem>
        {closedCount > 0 && (
          <ContextMenuItem onClick={onReopenClosedTab}>{menuLabel("sidebar", "reopenClosed")}</ContextMenuItem>
        )}
        <ContextMenuItem onClick={onNewFolder}>{menuLabel("sidebar", "newFolder")}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
