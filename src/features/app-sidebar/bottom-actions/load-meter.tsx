import { useEffect, useRef, useState } from "react"
import { animate, useReducedMotion } from "motion/react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Tab } from "@/shared"
import { Favicon, tabLabel } from "@/shared/components"

/** What the load meter shows; the widget builds it from `get_memory` and the tab state. */
export type LoadMeterData = {
  totalMb: number
  /** Ezel, its UI and WebView2's shared processes: no single tab's. */
  sharedMb: number
  /** Loaded tabs, largest first. `approximate`: a process split with other tabs. */
  tabs: { tab: Tab; mb: number; approximate: boolean }[]
  /** Unloaded tabs: they use nothing until selected. */
  restingCount: number
}

/** Rows in the tooltip: the heaviest tabs, enough to see where memory goes. */
const TOP_TABS = 5

/** "640 MB", "1.2 GB". */
function formatMemory(mb: number) {
  return mb < 1024 ? `${Math.max(0, Math.round(mb))} MB` : `${(mb / 1024).toFixed(1)} GB`
}

/** Eases the shown number to each new value, so a refresh reads as a living gauge, not a flicker. */
function useEasedNumber(value: number) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (reduced) {
      from.current = value
      return
    }
    const controls = animate(from.current, value, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (v) => {
        from.current = v
        setShown(v)
      },
    })
    return () => controls.stop()
  }, [value, reduced])
  // Reduced motion: the new value at once.
  return reduced ? value : shown
}

/**
 * "Ezel is carrying ~640 MB": a quiet line in the sidebar footer (vision: the honest Load meter).
 * Every number is approximate (processes share memory), hence "~". Hover or focus shows where it
 * goes: the heaviest tabs, the shared part, and how many tabs are resting (unloaded, using nothing).
 * With nothing loaded, Ezel is resting.
 */
export function LoadMeter({ data }: { data: LoadMeterData }) {
  const total = useEasedNumber(data.totalMb)
  const resting = data.tabs.length === 0
  const sentence = resting ? "Ezel is resting" : `Ezel is carrying ~${formatMemory(total)}`
  const split = data.tabs.some((t) => t.approximate)
  const hidden = data.tabs.length - TOP_TABS

  return (
    <Tooltip>
      <TooltipTrigger
        render={<span tabIndex={0} />}
        aria-label={`${resting ? "Ezel is resting" : `Ezel is carrying about ${formatMemory(data.totalMb)}`}. Memory by tab`}
        className="min-w-0 flex-1 cursor-default truncate rounded-sm px-1 text-[11px] leading-6 text-sidebar-foreground/55 tabular-nums outline-none hover:text-sidebar-foreground/75 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        {sentence}
      </TooltipTrigger>
      {/* Above the footer and start-aligned, so it stays inside the sidebar (the page covers the rest). */}
      <TooltipContent side="top" align="start" className="w-[212px] max-w-[212px] flex-col items-stretch gap-1 py-2">
        <p className="font-medium">
          {resting ? "Ezel is resting" : `Ezel is carrying ~${formatMemory(data.totalMb)}`}
        </p>
        {data.tabs.slice(0, TOP_TABS).map(({ tab, mb, approximate }) => (
          <div key={tab.id} className="flex min-w-0 items-center gap-1.5">
            <Favicon src={tab.favicon} />
            <span className="min-w-0 flex-1 truncate text-background/80">{tabLabel(tab)}</span>
            <span className="shrink-0 text-background/70 tabular-nums">
              {approximate ? "≈ " : ""}
              {formatMemory(mb)}
            </span>
          </div>
        ))}
        {hidden > 0 && <p className="text-background/55">and {hidden} more</p>}
        <div className="flex items-center justify-between gap-2 text-background/55">
          <span>Ezel and shared</span>
          <span className="tabular-nums">{formatMemory(data.sharedMb)}</span>
        </div>
        {data.restingCount > 0 && (
          <p className="text-background/55">
            {data.restingCount} {data.restingCount === 1 ? "tab is" : "tabs are"} resting
          </p>
        )}
        {split && <p className="text-background/45">≈ split with tabs on the same site</p>}
      </TooltipContent>
    </Tooltip>
  )
}
