import type { CSSProperties } from "react"
import { Outlet } from "react-router-dom"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { WindowFrame } from "@/shared/components"
import { AppSidebar, SIDEBAR_WIDTH } from "@/widgets/app-sidebar"
import { AppTitlebar } from "@/widgets/app-titlebar/AppTitlebar"

export default function AppLayout() {
  return (
    // Wraps the whole frame so the titlebar can toggle the sidebar too (Ctrl+B does the same).
    // The window frame keeps its own background; only the row below the titlebar is sidebar-coloured.
    <SidebarProvider
      defaultOpen
      style={{ "--sidebar-width": SIDEBAR_WIDTH } as CSSProperties}
      className="h-full min-h-0 has-data-[variant=inset]:bg-transparent"
    >
      <WindowFrame titlebar={<AppTitlebar />}>
        {/* relative: the sidebar positions itself against this area, below the titlebar. */}
        <div className="relative flex min-h-0 flex-1 bg-sidebar">
          <AppSidebar />
          {/* No margin of its own: the frame's p-1 is the only gap, so it uses the frame radius. */}
          <SidebarInset className="min-h-0 min-w-0 peer-data-[variant=inset]:m-0 peer-data-[variant=inset]:rounded-frame peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-0">
            <Outlet />
          </SidebarInset>
        </div>
      </WindowFrame>
    </SidebarProvider>
  )
}
