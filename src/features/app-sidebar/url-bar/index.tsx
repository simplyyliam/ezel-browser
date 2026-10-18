import { useState, type KeyboardEvent } from "react"
import { SidebarInput } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { navigate } from "@/shared"
import { LoadingIndicator } from "./loading-indicator"

type UrlBarProps = {
  url: string
  isLoading: boolean
  className?: string
}

export function UrlBar({ url, isLoading, className }: UrlBarProps) {
  // While focused the input holds what the user types; otherwise it mirrors the current URL.
  const [draft, setDraft] = useState<string | null>(null)

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      const input = event.currentTarget.value.trim()
      if (input) navigate(input)
      event.currentTarget.blur()
    } else if (event.key === "Escape") {
      event.currentTarget.blur()
    }
  }

  return (
    <div className={cn("relative min-w-0", className)}>
      <SidebarInput
        aria-label="Address"
        placeholder="Search or enter address"
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        value={draft ?? url}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => {
          setDraft(url)
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
