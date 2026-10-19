import { Download, Plus, Trash2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { menuLabel } from "@/shared"

/** Small icon-only pills, as in the design. */
const action = "h-6 w-7 justify-center bg-sidebar-foreground/5 p-0 hover:bg-sidebar-foreground/8 [&_svg]:size-3.5"

type BottomActionsProps = {
  /** False disables trash-all (no temp tabs in the active space). */
  hasTempTabs: boolean
  /** Closes the active space's TEMP tabs only, never pinned ones. */
  onTrashAll: () => void
  onAddSpace: () => void
  onAddTab: () => void
}

/** Pinned to the bottom of the sidebar (render inside SidebarFooter). */
export function BottomActions({ hasTempTabs, onTrashAll, onAddSpace, onAddTab }: BottomActionsProps) {
  return (
    <SidebarMenu className="flex-row items-center gap-1.5">
      <SidebarMenuItem>
        {/* TODO: open the downloads list. */}
        <SidebarMenuButton size="sm" aria-label="Downloads" className={action}>
          <Download aria-hidden />
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="sm"
          aria-label="Close all temporary tabs"
          disabled={!hasTempTabs}
          onClick={onTrashAll}
          className={action}
        >
          <Trash2 aria-hidden />
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="sm" aria-label="Add" className={action} />}>
            <Plus aria-hidden />
          </DropdownMenuTrigger>
          {/* The website webview is drawn over everything right of the sidebar: open upwards, end-aligned, so the menu stays inside it. */}
          <DropdownMenuContent side="top" align="end">
            {/* Catalog area "add". A pull-down is a regular menu: what isn't built yet shows dimmed (HIG menus.md). */}
            <DropdownMenuItem onClick={onAddTab}>{menuLabel("add", "newTab")}</DropdownMenuItem>
            <DropdownMenuItem disabled>{menuLabel("add", "newFolder")}</DropdownMenuItem>
            <DropdownMenuItem onClick={onAddSpace}>{menuLabel("add", "newSpace")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
