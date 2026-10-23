import { Favicon, tabLabel } from "@/shared/components"
import type { Id, Tab } from "@/shared"

type QuickTabsProps = {
  /** The shown tab's folder's other tabs, or the Swatches outside a folder (the widget decides). */
  tabs: Tab[]
  onSelect: (tabId: Id) => void
}

/** Most icons shown; a folder or the Swatches rarely hold more, and the bar stays calm. */
const MAX_QUICK_TABS = 8

/**
 * The left of the titlebar peek: the tabs next to this one as small icons (vision: "jump between
 * Figma, localhost and docs without the sidebar"). A click switches. Names show on hover.
 */
export function QuickTabs({ tabs, onSelect }: QuickTabsProps) {
  if (tabs.length === 0) return null
  return (
    <nav aria-label="Nearby tabs" className="flex min-w-0 items-center gap-0.5 pl-1.5">
      {tabs.slice(0, MAX_QUICK_TABS).map((tab) => (
        <button
          key={tab.id}
          type="button"
          title={tabLabel(tab)}
          aria-label={tabLabel(tab)}
          onClick={() => onSelect(tab.id)}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <Favicon src={tab.favicon} className={tab.isLoaded ? undefined : "opacity-50"} />
        </button>
      ))}
    </nav>
  )
}
