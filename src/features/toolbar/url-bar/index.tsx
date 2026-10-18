import { useState, type KeyboardEvent } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { navigate } from "@/shared"

type UrlBarProps = {
  url: string
  className?: string
}

export function UrlBar({ url, className }: UrlBarProps) {
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
    <Input
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
      className={cn("h-8", className)}
    />
  )
}
