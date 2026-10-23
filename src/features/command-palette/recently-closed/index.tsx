import { RotateCcw } from "lucide-react"
import { Favicon } from "@/shared/components"
import type { ClosedTab } from "@/shared/bindings"

type RecentlyClosedProps = {
  /** The last few closed tabs, newest first. */
  tabs: ClosedTab[]
  /** Reopens the n-th (0 = newest) where it was. */
  onReopen: (n: number) => void
}

/** "Where did that site go?": a title, else the address's host. */
function label(tab: ClosedTab) {
  if (tab.title) return tab.title
  try {
    return new URL(tab.url).host || tab.url
  } catch {
    return tab.url
  }
}

/**
 * The palette's recently closed tray: the last few closed tabs as small chips under its list
 * (vision: "Recently closed tray"), only while there are any and nothing's typed. A click brings
 * one back where it was, like Ctrl+Shift+T for any of them.
 */
export function RecentlyClosed({ tabs, onReopen }: RecentlyClosedProps) {
  if (tabs.length === 0) return null
  return (
    <div className="flex items-center gap-1.5 border-t border-border/50 px-3 py-2">
      <RotateCcw aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="sr-only">Recently closed</span>
      <ul className="flex min-w-0 flex-1 gap-1 overflow-hidden">
        {tabs.map((tab, n) => (
          <li key={`${n}-${tab.url}`} className="min-w-0 shrink">
            <button
              type="button"
              title={`Reopen ${label(tab)}`}
              onClick={() => onReopen(n)}
              className="flex h-6 max-w-40 min-w-0 cursor-pointer items-center gap-1.5 rounded-full bg-muted/60 pr-2.5 pl-1.5 text-xs text-foreground/80 outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <Favicon src={tab.favicon} className="size-3.5 bg-foreground/15" />
              <span className="min-w-0 truncate">{label(tab)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
