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

// The sidebar's own menu: actions about the sidebar and creating things in it. Item-level menus
// (tab, folder, space, swatch) come with those items. Guidance: docs/design/context-menus.md.
// TODO: wire "New Folder" (with drag-into-folder) and "Edit Theme…" once they exist.

type SidebarContextMenuProps = {
  /** The area that opens the menu on right-click. */
  children: ReactNode
  onNewTab: () => void
  onNewSpace: () => void
  className?: string
}

export function SidebarContextMenu({ children, onNewTab, onNewSpace, className }: SidebarContextMenuProps) {
  const { open, setOpen } = useSidebar()

  return (
    <ContextMenu>
      <ContextMenuTrigger className={className}>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {/* Compact mode = the collapsed sidebar that peeks from the left edge; off = docked. */}
        <ContextMenuCheckboxItem checked={!open} onCheckedChange={(compact) => setOpen(!compact)}>
          Compact mode
        </ContextMenuCheckboxItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onNewTab}>New Tab</ContextMenuItem>
        {/* TODO: create a folder in the active space. */}
        <ContextMenuItem>New Folder</ContextMenuItem>
        <ContextMenuItem onClick={onNewSpace}>New Space</ContextMenuItem>
        <ContextMenuSeparator />
        {/* TODO: open the theme editor (src/theme: setTheme / setTokens). */}
        <ContextMenuItem>Edit Theme…</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
