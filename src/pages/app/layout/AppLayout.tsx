import type { CSSProperties } from "react"
import { Outlet } from "react-router-dom"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { useBrowserHotkeys, useDismissPopupsOnBlur, useHotkeys, usePage, usePopupCutouts } from "@/shared"
import { Toaster, WindowFrame } from "@/shared/components"
import { AppSidebar, SIDEBAR_WIDTH } from "@/widgets/app-sidebar"
import { AppTitlebar } from "@/widgets/app-titlebar/AppTitlebar"
import { CommandPalette } from "@/widgets/command-palette"
import { SitePermissions } from "@/widgets/site-permissions"

export default function AppLayout() {
  // Menus may open over the page (the website is drawn above all UI): cut them out so they show.
  usePopupCutouts()
  // Clicks on the page never reach the UI: close popups when the UI loses focus instead.
  useDismissPopupsOnBlur()
  // App shortcuts, wherever focus is: the UI's keydown, or Rust forwarding them from the website.
  useHotkeys()
  // Ctrl+W, Ctrl+Tab, Ctrl+1…9, Ctrl+R/F5, Alt+←/→, Esc, F12, Ctrl+Shift+C (shared/browser-hotkeys).
  useBrowserHotkeys()
  // A video (any element) in HTML fullscreen: the window is fullscreen (Rust) and the UI steps
  // aside, so the page fills it edge to edge. Esc or the site's own button brings everything back.
  const { fullscreen } = usePage()

  return (
    // Wraps the whole frame so the titlebar can toggle the sidebar too (Ctrl+B does the same).
    // Starts collapsed: Zen's compact mode, where the sidebar peeks out from the left edge.
    <SidebarProvider
      defaultOpen={false}
      style={{ "--sidebar-width": SIDEBAR_WIDTH } as CSSProperties}
      className="h-full min-h-0"
    >
      <WindowFrame titlebar={fullscreen ? null : <AppTitlebar />} className={cn(fullscreen && "p-0 [&>div]:rounded-none")}>
        {/* relative: the sidebar positions itself against this area, below the titlebar. */}
        <div className="relative flex min-h-0 flex-1">
          {!fullscreen && <AppSidebar />}
          {/* Sits flush in the window frame, so it uses the frame radius. Docked (sidebar open), its
              left side meets the sidebar flush, so only the right corners stay rounded. */}
          <SidebarInset className={cn("min-h-0 min-w-0 rounded-frame peer-data-[state=expanded]:rounded-l-none", fullscreen && "rounded-none")}>
            <Outlet />
          </SidebarInset>
        </div>
      </WindowFrame>
      {/* New Tab, Ctrl+T, Ctrl+L. Inside the provider: one of its actions toggles the sidebar. */}
      <CommandPalette />
      {/* Every site's remembered camera, microphone, location and clipboard answers. */}
      <SitePermissions />
      {/* "Link copied" and other passive confirmations, bottom-left inside the sidebar's width. */}
      <Toaster />
    </SidebarProvider>
  )
}
