import { ContentSlot } from "@/features/browser-view/content-slot"
import { PageMenu } from "@/features/browser-view/page-menu"
import { usePageMenu } from "@/shared/page-menu"

/** The browser view: the area the website fills, and the page's own right-click menu. */
export function BrowserView() {
  const { menu, close } = usePageMenu()
  return (
    // Inherits the sidebar inset's corners (they change with the sidebar's state); the slot passes them on to the website's clip.
    <div className="flex min-h-0 flex-1 flex-col rounded-[inherit]">
      <ContentSlot className="rounded-[inherit]" />
      {/* Keyed per right-click: each one is a fresh menu. */}
      {menu && <PageMenu key={menu.id} menu={menu} onClose={close} />}
    </div>
  )
}
