import { Download, Plus, Trash2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

/** Small icon-only pills, as in the design. */
const action = "h-6 w-7 justify-center bg-sidebar-foreground/5 p-0 hover:bg-sidebar-foreground/8 [&_svg]:size-3.5"

/** Pinned to the bottom of the sidebar (render inside SidebarFooter). None of these do anything yet. */
export function BottomActions() {
  return (
    <SidebarMenu className="flex-row items-center gap-1.5">
      <SidebarMenuItem>
        {/* TODO: open the downloads list. */}
        <SidebarMenuButton size="sm" aria-label="Downloads" className={action}>
          <Download aria-hidden />
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        {/* TODO: trash-all closes TEMP tabs only, never pinned ones. */}
        <SidebarMenuButton size="sm" aria-label="Close all temporary tabs" className={action}>
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
            {/* TODO: create a space / a tab. */}
            <DropdownMenuItem>Add space</DropdownMenuItem>
            <DropdownMenuItem>Add tab</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
