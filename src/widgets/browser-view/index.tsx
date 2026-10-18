import { ContentSlot } from "@/features/browser-view/content-slot"

/** The browser view: the area the website fills. */
export function BrowserView() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Bottom corners sit on the window frame's rounded corners. */}
      <ContentSlot className="rounded-b-frame" />
    </div>
  )
}
