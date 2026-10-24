import { AppWindow } from "lucide-react"
import { SpaceIcon } from "@/shared/components"

type FooterProps = {
  /** Where Enter puts the page: the space a new tab lands in (its icon or emoji), or the shown tab (null). */
  destination: { spaceIcon: string | null; label: string }
  keys: { key: string; label: string }[]
}

/** One quiet line under the results: where things will open, and the keys that matter right now. */
export function Footer({ destination: { spaceIcon, label }, keys }: FooterProps) {
  return (
    <div className="flex h-9 items-center gap-3 border-t border-border/50 px-4 text-[11px] text-muted-foreground">
      <span className="flex min-w-0 items-center gap-1.5">
        {spaceIcon ? <SpaceIcon icon={spaceIcon} className="size-3 text-[0.75rem]" /> : <AppWindow className="size-3 shrink-0" aria-hidden />}
        <span className="truncate">{label}</span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-3">
        {keys.map(({ key, label }) => (
          <span key={key} className="flex items-center gap-1">
            <kbd className="min-w-4 rounded bg-muted px-1 text-center font-sans text-[10px] leading-4 text-foreground/70">{key}</kbd>
            {label}
          </span>
        ))}
      </span>
    </div>
  )
}
