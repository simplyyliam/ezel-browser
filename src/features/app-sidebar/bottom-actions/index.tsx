import { Download, Plus, Trash2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const action =
  "flex h-3.5 w-[18px] items-center justify-center rounded-[5px] bg-sidebar-foreground/5 text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-foreground/8 focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-expanded:bg-sidebar-foreground/8 [&_svg]:size-[9px]"

/** Pinned to the bottom of the sidebar. None of these do anything yet. */
export function BottomActions() {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        {/* TODO: open the downloads list. */}
        <button type="button" aria-label="Downloads" className={action}>
          <Download aria-hidden />
        </button>
        {/* TODO: trash-all closes TEMP tabs only, never pinned ones. */}
        <button type="button" aria-label="Close all temporary tabs" className={action}>
          <Trash2 aria-hidden />
        </button>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Add" className={action}>
          <Plus aria-hidden />
        </DropdownMenuTrigger>
        {/* The website webview is drawn over everything right of the sidebar: open upwards, end-aligned, so the menu stays inside it. */}
        <DropdownMenuContent side="top" align="end" className="w-auto min-w-28">
          {/* TODO: create a space / a tab. */}
          <DropdownMenuItem>Add space</DropdownMenuItem>
          <DropdownMenuItem>Add tab</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
