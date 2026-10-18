import { ContentSlot } from "@/features/browser-view/content-slot"

/** The browser view: the area the website fills. */
export function BrowserView() {
  return (
    // Inherits the sidebar inset's corners (they change with the sidebar's state); the slot passes them on to the website's clip.
    <div className="flex min-h-0 flex-1 flex-col rounded-[inherit]">
      <ContentSlot className="rounded-[inherit]" />
    </div>
  )
}
