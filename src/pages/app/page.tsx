import { BrowserView } from "@/widgets/browser-view"
import { Toolbar } from "@/widgets/toolbar"

export default function BrowserPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* TODO: temporary; remove once the sidebar and command palette replace the toolbar. */}
      <Toolbar />
      <BrowserView />
    </div>
  )
}
