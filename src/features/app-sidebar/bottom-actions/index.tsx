import type { ReactNode } from "react"
import { Download, Plus } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { menuLabel, type Download as DownloadData } from "@/shared"
import { DownloadsList, type DownloadActions } from "./downloads"

export type { LoadMeterData } from "./load-meter"
export type { DownloadActions } from "./downloads"

/** Small icon-only pills, as in the design. */
const action = "h-6 w-7 justify-center bg-sidebar-foreground/5 p-0 hover:bg-sidebar-foreground/8 [&_svg]:size-3.5"

type BottomActionsProps = {
  onAddSpace: () => void
  onAddTab: () => void
  onAddFolder: () => void
  /** The footer's middle: the spaces' icons (the widget composes them). */
  center?: ReactNode
  /** This session's downloads, newest first. */
  downloads: DownloadData[]
  downloadActions: DownloadActions
}

/** Pinned to the bottom of the sidebar (render inside SidebarFooter). */
export function BottomActions({ onAddSpace, onAddTab, onAddFolder, center, downloads, downloadActions }: BottomActionsProps) {
  const running = downloads.some((d) => d.state === "inProgress")
  return (
    <SidebarMenu className="flex-row items-center gap-1.5">
      <SidebarMenuItem>
        <Popover>
          <PopoverTrigger
            render={<SidebarMenuButton size="sm" aria-label={running ? "Downloads, one in progress" : "Downloads"} className={`relative ${action}`} />}
          >
            <Download aria-hidden />
            {/* A still dot while something downloads (nothing pulses). */}
            {running && <span aria-hidden className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-sidebar-foreground/70" />}
          </PopoverTrigger>
          {/* Above the footer and start-aligned, inside the sidebar's width: the page covers the rest. */}
          <PopoverContent side="top" align="start" className="w-[228px] gap-0 rounded-2xl p-2">
            <DownloadsList downloads={downloads} actions={downloadActions} />
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
      {/* Between the actions, centred: the spaces. Narrower than the space between, it scrolls. */}
      <div className="flex min-w-0 flex-1 justify-center">{center}</div>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="sm" aria-label="Add" className={action} />}>
            <Plus aria-hidden />
          </DropdownMenuTrigger>
          {/* The website webview is drawn over everything right of the sidebar: open upwards, end-aligned, so the menu stays inside it. */}
          <DropdownMenuContent side="top" align="end">
            {/* Catalog area "add". A pull-down is a regular menu: what isn't built yet shows dimmed (HIG menus.md). */}
            <DropdownMenuItem onClick={onAddTab}>{menuLabel("add", "newTab")}</DropdownMenuItem>
            <DropdownMenuItem onClick={onAddFolder}>{menuLabel("add", "newFolder")}</DropdownMenuItem>
            <DropdownMenuItem onClick={onAddSpace}>{menuLabel("add", "newSpace")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
