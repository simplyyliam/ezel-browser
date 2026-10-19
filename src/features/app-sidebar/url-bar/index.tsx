import { useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from "react"
import { SidebarInput } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { navigate } from "@/shared"
import { LoadingIndicator } from "./loading-indicator"

export type UrlBarHandle = {
  /** Focuses the bar empty, ready to type (New Tab). */
  focusEmpty: () => void
}

type UrlBarProps = {
  /** The shown tab's URL; follows the active tab through `page-changed`. */
  url: string
  isLoading: boolean
  className?: string
  ref?: Ref<UrlBarHandle>
}

export function UrlBar({ url, isLoading, className, ref }: UrlBarProps) {
  // While focused the input holds what the user types; otherwise it mirrors the current URL.
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const startEmpty = useRef(false)

  useImperativeHandle(ref, () => ({
    focusEmpty() {
      startEmpty.current = true
      setDraft("")
      inputRef.current?.focus()
    },
  }))

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      const input = event.currentTarget.value.trim()
      // Loads in the shown tab (Rust opens a temp tab if none is shown).
      if (input) navigate(input)
      event.currentTarget.blur()
    } else if (event.key === "Escape") {
      event.currentTarget.blur()
    }
  }

  return (
    <div className={cn("relative min-w-0", className)}>
      <SidebarInput
        ref={inputRef}
        aria-label="Address"
        placeholder="Search or enter address"
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        value={draft ?? url}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => {
          if (!startEmpty.current) setDraft(url)
          startEmpty.current = false
          event.currentTarget.select()
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={handleKeyDown}
        className="pr-8"
      />
      <LoadingIndicator
        isLoading={isLoading}
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2"
      />
    </div>
  )
}
