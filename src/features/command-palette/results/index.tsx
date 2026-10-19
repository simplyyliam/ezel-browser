import { Check, type LucideIcon } from "lucide-react"
import { motion } from "motion/react"
import { CommandGroup, CommandItem, CommandShortcut } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { Favicon } from "@/shared/components"

/** A row's leading icon: a site's favicon (null: the empty-circle placeholder) or a glyph. */
export type RowIcon = { kind: "favicon"; src: string | null } | { kind: "glyph"; icon: LucideIcon }

export type PaletteRow = {
  /** Unique, lowercase: it's also cmdk's value (the selection). */
  id: string
  icon: RowIcon
  title: string
  /** Muted, after the title: the address, the space, "Google Search"… */
  detail?: string
  /** What Enter does here, shown on the selected row ("Open", "Switch to Tab"). */
  hint: string
  /** Dimmed like the sidebar's unloaded tabs. */
  dimmed?: boolean
}

export type PaletteSection = { id: string; heading?: string; rows: PaletteRow[] }

type ResultsProps = {
  sections: PaletteSection[]
  selectedId: string
  /** Typed words, bolded where they appear in titles. */
  tokens: string[]
  /** A row that just did its job without closing (Copy Link): its hint becomes a check for a moment. */
  doneId: string | null
  onRun: (row: PaletteRow) => void
}

/** The palette's rows. The selection is one highlight that glides from row to row. */
export function Results({ sections, selectedId, tokens, doneId, onRun }: ResultsProps) {
  return sections.map((section) => (
    <CommandGroup key={section.id} heading={section.heading} className="p-1 **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1">
      {section.rows.map((row) => (
        <ResultRow
          key={row.id}
          row={row}
          selected={row.id === selectedId}
          done={row.id === doneId}
          tokens={tokens}
          onRun={onRun}
        />
      ))}
    </CommandGroup>
  ))
}

type ResultRowProps = { row: PaletteRow; selected: boolean; done: boolean; tokens: string[]; onRun: (row: PaletteRow) => void }

function ResultRow({ row, selected, done, tokens, onRun }: ResultRowProps) {
  return (
    <CommandItem
      value={row.id}
      onSelect={() => onRun(row)}
      // The registry's selected fill is replaced by the gliding highlight below.
      className="isolate h-10 gap-3 rounded-xl! px-3 py-0 font-normal data-selected:bg-transparent"
    >
      {selected && (
        <motion.span
          layoutId="palette-highlight"
          aria-hidden
          className="absolute inset-0 -z-10 rounded-xl bg-muted"
          transition={{ type: "spring", stiffness: 700, damping: 45, mass: 0.6 }}
        />
      )}
      <RowIconView icon={row.icon} dimmed={row.dimmed} />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className={cn("truncate", row.dimmed && !selected && "text-foreground/70")}>
          <Highlighted text={row.title} tokens={tokens} />
        </span>
        {row.detail && <span className="shrink-[2] truncate text-xs text-muted-foreground">{row.detail}</span>}
      </span>
      <CommandShortcut
        className={cn(
          "flex items-center gap-1 tracking-normal opacity-0 transition-opacity duration-150 group-data-selected/command-item:opacity-100 motion-reduce:transition-none",
          done && "text-foreground opacity-100",
        )}
      >
        {done ? (
          <>
            <Check className="size-3.5! animate-in zoom-in-50 fade-in-0 duration-200" aria-hidden />
            Copied
          </>
        ) : (
          <>
            {row.hint}
            <kbd className="ml-1 rounded bg-background/70 px-1 font-sans text-[10px] leading-4 text-muted-foreground">↵</kbd>
          </>
        )}
      </CommandShortcut>
    </CommandItem>
  )
}

function RowIconView({ icon, dimmed }: { icon: RowIcon; dimmed?: boolean }) {
  if (icon.kind === "glyph") {
    const Glyph = icon.icon
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground group-data-selected/command-item:bg-background/70 group-data-selected/command-item:text-foreground">
        <Glyph className="size-3.5!" aria-hidden />
      </span>
    )
  }
  return (
    <span className="grid size-6 shrink-0 place-items-center">
      <Favicon src={icon.src} className={cn("size-4", !icon.src && "bg-foreground/15", dimmed && "opacity-60")} />
    </span>
  )
}

/** `text` with every typed word that appears in it set in the full-strength colour. */
function Highlighted({ text, tokens }: { text: string; tokens: string[] }) {
  if (tokens.length === 0) return text
  const lower = text.toLowerCase()
  const marked = new Array<boolean>(text.length).fill(false)
  for (const token of tokens) {
    const at = lower.indexOf(token)
    if (at >= 0) marked.fill(true, at, at + token.length)
  }
  const parts: { text: string; mark: boolean }[] = []
  for (let i = 0; i < text.length; i++) {
    const last = parts.at(-1)
    if (last && last.mark === marked[i]) last.text += text[i]
    else parts.push({ text: text[i], mark: marked[i] })
  }
  return parts.map((part, i) =>
    part.mark ? (
      <mark key={i} className="bg-transparent font-semibold text-foreground">
        {part.text}
      </mark>
    ) : (
      <span key={i} className="text-foreground/75">
        {part.text}
      </span>
    ),
  )
}

/**
 * Swatches as tiles above the rows while nothing is typed, like Safari's Favourites: fixed-size
 * tiles packed from the leading edge, so they read as one group (HIG layout.md: group related items,
 * keep spacing consistent). Stretching them into columns across the palette left wide empty gaps.
 * All 8 fit one line.
 */
export function SwatchTiles({
  tiles,
  selectedId,
  onRun,
}: {
  tiles: (PaletteRow & { shown: boolean })[]
  selectedId: string
  onRun: (row: PaletteRow) => void
}) {
  return (
    <CommandGroup heading="Swatches" className="p-1 **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-items]]:flex **:[[cmdk-group-items]]:flex-wrap **:[[cmdk-group-items]]:gap-0.5">
      {tiles.map((tile) => (
        <CommandItem
          key={tile.id}
          value={tile.id}
          onSelect={() => onRun(tile)}
          className="isolate h-auto w-16 flex-col gap-1 rounded-xl! px-1 pt-2 pb-1.5 data-selected:bg-transparent"
        >
          {tile.id === selectedId && (
            <motion.span
              layoutId="palette-highlight"
              aria-hidden
              className="absolute inset-0 -z-10 rounded-xl bg-muted"
              transition={{ type: "spring", stiffness: 700, damping: 45, mass: 0.6 }}
            />
          )}
          <span
            className={cn(
              "relative grid size-9 place-items-center rounded-[10px] bg-muted ring-1 ring-foreground/5 transition-transform duration-150 ease-out group-data-selected/command-item:scale-105 group-data-selected/command-item:bg-background/70 motion-reduce:transition-none",
            )}
          >
            <Favicon src={tile.icon.kind === "favicon" ? tile.icon.src : null} className={cn("size-[18px]", tile.dimmed && "opacity-60")} />
            {/* The one on screen gets a dot, like a running app in a dock. */}
            {tile.shown && <span aria-hidden className="absolute -bottom-1 size-1 rounded-full bg-primary" />}
          </span>
          <span className="w-full truncate text-center text-[11px] text-muted-foreground group-data-selected/command-item:text-foreground">
            {tile.title}
          </span>
          {/* cmdk's check icon has no place on a tile. */}
          <CommandShortcut className="hidden" />
        </CommandItem>
      ))}
    </CommandGroup>
  )
}
