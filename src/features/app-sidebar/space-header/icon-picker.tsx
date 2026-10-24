import { useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { ScrollArea, SpaceIcon } from "@/shared/components"
import { emojiIcon, isEmojiIcon, SPACE_ICON_NAMES } from "@/shared"

// Change Icon…: a popover under the space's title. Emoji first (most people pick one), every
// emoji Windows draws, searchable by name, in Unicode's groups; or one of Ezel's icons. Small
// cells (26px, 18px emoji) so a lot fits in the sidebar's width, like the system emoji panel.
// Picking applies it and closes (HIG popovers.md).

type EmojiGroup = { name: string; emojis: { emoji: string; name: string }[] }

/** Unicode's emoji, loaded the first time the picker opens (a separate chunk: ~400 KB of JSON). */
let groups: Promise<EmojiGroup[]> | null = null
function loadEmoji() {
  groups ??= import("unicode-emoji-json/data-by-group.json").then(({ default: data }) =>
    (data as { name: string; emojis: { emoji: string; name: string }[] }[])
      .filter((group) => group.name !== "Component")
      .map((group) => ({
        name: group.name,
        // Only what a space can take (Rust's rule): drops keycaps like 1️⃣ that hold a digit.
        emojis: group.emojis.filter((e) => emojiIcon(e.emoji) === e.emoji).map(({ emoji, name }) => ({ emoji, name })),
      })),
  )
  return groups
}

function useEmojiGroups(active: boolean) {
  const [data, setData] = useState<EmojiGroup[] | null>(null)
  useEffect(() => {
    if (!active || data) return
    let alive = true
    loadEmoji().then((loaded) => alive && setData(loaded))
    return () => {
      alive = false
    }
  }, [active, data])
  return data
}

const CELL =
  "flex size-[26px] items-center justify-center rounded-md outline-none transition-[background-color,scale] duration-(--motion-fast) ease-ezel-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:scale-90 motion-reduce:transition-none"

export function IconPicker({
  open,
  onOpenChange,
  current,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: string
  onPick: (icon: string) => void
}) {
  const [side, setSide] = useState<"emoji" | "icons">("emoji")
  const [query, setQuery] = useState("")
  const data = useEmojiGroups(open && side === "emoji")
  const shown = useMemo(() => {
    if (!data) return null
    const q = query.trim().toLowerCase()
    if (!q) return data
    // A typed or pasted emoji is offered as it is; words search the names.
    const typed = emojiIcon(query)
    const found = data.flatMap((g) => g.emojis).filter((e) => e.name.includes(q))
    return [{ name: "Results", emojis: typed && !found.some((e) => e.emoji === typed) ? [{ emoji: typed, name: "typed" }, ...found] : found }]
  }, [data, query])

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (next) {
          setSide(isEmojiIcon(current) || !SPACE_ICON_NAMES.includes(current) ? "emoji" : "icons")
          setQuery("")
        }
      }}
    >
      {/* Opened from the space's menu, not by clicking: the trigger only anchors it to the title. */}
      <PopoverTrigger
        nativeButton={false}
        render={<span aria-hidden tabIndex={-1} className="pointer-events-none absolute inset-0" />}
      />
      {/* Start-aligned under the title and no wider than the sidebar, so the website never covers it. */}
      <PopoverContent align="start" className="w-(--anchor-width) gap-2 rounded-xl p-2">
        <div className="flex items-center gap-2">
          {/* Two closely related choices (HIG segmented-controls.md), text only. */}
          <div role="radiogroup" aria-label="Icon kind" className="flex gap-0.5 rounded-lg bg-muted p-0.5 text-xs font-medium">
            {(["emoji", "icons"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={side === kind}
                onClick={() => setSide(kind)}
                className={cn(
                  "rounded-md px-2.5 py-0.5 outline-none transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:ring-ring",
                  side === kind ? "bg-popover text-popover-foreground shadow-xs" : "text-muted-foreground hover:text-popover-foreground",
                )}
              >
                {kind === "emoji" ? "Emoji" : "Icons"}
              </button>
            ))}
          </div>
        </div>
        {side === "emoji" ? (
          <>
            <label className="flex h-7 items-center gap-1.5 rounded-lg bg-muted px-2 text-xs focus-within:ring-2 focus-within:ring-ring">
              <Search aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                aria-label="Search emoji"
                placeholder="Search emoji"
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  const first = shown?.[0]?.emojis[0]
                  if (event.key === "Enter" && first) onPick(first.emoji)
                }}
                spellCheck={false}
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
              />
            </label>
            <ScrollArea className="h-56">
              {!shown ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">Loading emoji…</p>
              ) : shown.every((g) => g.emojis.length === 0) ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">No emoji called “{query.trim()}”</p>
              ) : (
                shown.map((group) => (
                  <section key={group.name} aria-label={group.name}>
                    <h3 className="px-1 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground">{group.name}</h3>
                    <div role="radiogroup" aria-label={group.name} className="grid grid-cols-[repeat(auto-fill,26px)] justify-between">
                      {group.emojis.map(({ emoji, name }) => (
                        <button
                          key={emoji}
                          type="button"
                          role="radio"
                          aria-checked={emoji === current}
                          aria-label={name}
                          title={name}
                          onClick={() => onPick(emoji)}
                          className={cn(CELL, "font-emoji text-[18px] leading-none", emoji === current && "bg-accent")}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </ScrollArea>
          </>
        ) : (
          <div role="radiogroup" aria-label="Space icon" className="grid grid-cols-[repeat(auto-fill,26px)] justify-between">
            {SPACE_ICON_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={name === current}
                aria-label={name.replace(/-/g, " ")}
                title={name.replace(/-/g, " ")}
                onClick={() => onPick(name)}
                className={cn(CELL, "text-popover-foreground/70 hover:text-accent-foreground", name === current && "bg-accent text-accent-foreground")}
              >
                <SpaceIcon icon={name} className="size-3.5" />
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
