import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { ChevronDown, ChevronUp, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { stopFinding, useContentCutout } from "@/shared"

type FindBarProps = {
  /** The current results: 1-based active match (0: none) and the count. Null before any. */
  results: { active: number; count: number } | null
  /** Bumped by Ctrl+F while open: the field takes focus and selects its text again. */
  focusKey: number
  onQuery: (query: string) => void
  onNext: (backward: boolean) => void
  /** Esc or the close button (`refocus`: the page gets the keyboard back). */
  onClose: (refocus: boolean) => void
}

const button =
  "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[calc(var(--radius-xl)-0.25rem)] text-muted-foreground outline-none transition-colors duration-(--motion-base) hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none [&_svg]:size-3.5"

/**
 * Find in page (Ctrl+F): a small bar inside the page's top-right corner, cut out of the website
 * (a hole can't fade, so it appears in one piece). Enter is next, Shift+Enter previous, Esc closes.
 * The page highlights every match itself (WebView2's find).
 */
export function FindBar({ results, focusKey, onQuery, onNext, onClose }: FindBarProps) {
  const ref = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  // 1px for the ring, drawn just outside the bar.
  useContentCutout("find", () => ref.current, 1)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [focusKey])
  // However it closes (Esc, another tab), the highlights go with it.
  useEffect(() => () => void stopFinding(false), [])

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      if (query) onNext(event.shiftKey)
    } else if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      onClose(true)
    }
  }

  const count = results?.count ?? 0
  const noMatches = query !== "" && results !== null && count === 0
  const status = !query || results === null ? "" : count === 0 ? "No matches" : `${Math.max(results.active, 1)} of ${count}`

  return (
    <div
      ref={ref}
      role="search"
      aria-label="Find in page"
      className="absolute top-2 right-2 z-20 flex w-72 items-center gap-1 rounded-xl bg-popover py-1 pr-1 pl-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      <input
        ref={input}
        aria-label="Find in page"
        placeholder="Find in page"
        spellCheck={false}
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          onQuery(event.target.value)
        }}
        onKeyDown={handleKeyDown}
        className="min-w-0 flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground"
      />
      <span aria-live="polite" className={cn("shrink-0 px-1 text-xs tabular-nums text-muted-foreground", noMatches && "text-destructive")}>
        {status}
      </span>
      <button type="button" aria-label="Previous match" disabled={count === 0} onClick={() => onNext(true)} className={button}>
        <ChevronUp aria-hidden />
      </button>
      <button type="button" aria-label="Next match" disabled={count === 0} onClick={() => onNext(false)} className={button}>
        <ChevronDown aria-hidden />
      </button>
      <button type="button" aria-label="Close find" onClick={() => onClose(true)} className={button}>
        <X aria-hidden />
      </button>
    </div>
  )
}
