import { createElement } from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { spaceIcon, type ZenImportPreview } from "@/shared"
import { ScrollArea } from "@/shared/components"

type SpacePickerProps = {
  preview: ZenImportPreview
  chosen: Set<string>
  onToggle: (spaceId: string) => void
  essentials: boolean
  onToggleEssentials: () => void
}

/** "4 pinned · 1 folder · 12 open", leaving out what's zero. */
function counts(pinned: number, folders: number, open: number) {
  const parts = [
    pinned > 0 && `${pinned} pinned`,
    folders > 0 && `${folders} ${folders === 1 ? "folder" : "folders"}`,
    open > 0 && `${open} open`,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : "Empty"
}

/** One row you can check: a space, or the Essentials. */
function Row({ checked, onToggle, icon, title, detail }: { checked: boolean; onToggle: () => void; icon: string; title: string; detail: string }) {
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-left outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-[5px] ring-1 ring-foreground/25",
            checked && "bg-foreground text-background ring-foreground",
          )}
        >
          {checked && <Check className="size-3" strokeWidth={3} />}
        </span>
        {createElement(spaceIcon(icon), { "aria-hidden": true, className: "size-4 shrink-0 text-muted-foreground" })}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-foreground">{title}</span>
          <span className="block text-xs text-muted-foreground">{detail}</span>
        </span>
      </button>
    </li>
  )
}

/** What Zen holds, to pick from: its spaces (each becomes an Ezel space) and its Essentials. */
export function SpacePicker({ preview, chosen, onToggle, essentials, onToggleEssentials }: SpacePickerProps) {
  return (
    <ScrollArea className="max-h-[min(360px,50vh)]">
      <ul className="flex flex-col gap-0.5 px-2">
        {preview.essentials > 0 && (
          <Row
            checked={essentials}
            onToggle={onToggleEssentials}
            icon="layout-grid"
            title="Essentials"
            detail={`${preview.essentials} as Swatches${preview.essentials > 8 ? " (8 fit; the rest are pinned)" : ""}`}
          />
        )}
        {preview.spaces.map((space) => (
          <Row
            key={space.id}
            checked={chosen.has(space.id)}
            onToggle={() => onToggle(space.id)}
            icon={space.icon}
            title={space.name}
            detail={counts(space.pinned, space.folders, space.open)}
          />
        ))}
      </ul>
    </ScrollArea>
  )
}
