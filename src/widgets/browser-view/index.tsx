import { ContentSlot } from "@/features/browser-view/content-slot"

/** The browser view: the area the website fills. */
export function BrowserView() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Same corners as the sidebar inset it fills, which sits flush in the window frame. */}
      <ContentSlot className="rounded-frame" />
    </div>
  )
}
