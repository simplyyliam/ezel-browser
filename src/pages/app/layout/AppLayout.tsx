import type { CSSProperties } from "react"
import { Outlet } from "react-router-dom"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useDismissPopupsOnBlur, usePopupCutouts } from "@/shared"
import { WindowFrame } from "@/shared/components"
import { AppSidebar, SIDEBAR_WIDTH } from "@/widgets/app-sidebar"
import { AppTitlebar } from "@/widgets/app-titlebar/AppTitlebar"

export default function AppLayout() {
  // Menus may open over the page (the website is drawn above all UI): cut them out so they show.
  usePopupCutouts()
  // Clicks on the page never reach the UI: close popups when the UI loses focus instead.
  useDismissPopupsOnBlur()

  return (
    // Wraps the whole frame so the titlebar can toggle the sidebar too (Ctrl+B does the same).
    // Starts collapsed: Zen's compact mode, where the sidebar peeks out from the left edge.
    <SidebarProvider
      defaultOpen={false}
      style={{ "--sidebar-width": SIDEBAR_WIDTH } as CSSProperties}
      className="h-full min-h-0"
    >
      <WindowFrame titlebar={<AppTitlebar />}>
        {/* relative: the sidebar positions itself against this area, below the titlebar. */}
        <div className="relative flex min-h-0 flex-1">
          <AppSidebar />
          {/* Sits flush in the window frame, so it uses the frame radius. Docked (sidebar open), its
              left side meets the sidebar flush, so only the right corners stay rounded. */}
          <SidebarInset className="min-h-0 min-w-0 rounded-frame peer-data-[state=expanded]:rounded-l-none">
            <Outlet />
          </SidebarInset>
        </div>
      </WindowFrame>
    </SidebarProvider>
  )
}
