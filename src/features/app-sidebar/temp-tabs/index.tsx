import { Plus } from "lucide-react"
import { AnimatePresence } from "motion/react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { DraggableTabItem, DropIndicator, ScrollArea, type TabRowActions } from "@/shared/components"
import { rowIndicator, useTabDropZone, type Tab } from "@/shared"

type TempTabsProps = {
  /** The active space's temp tabs, newest first. */
  tabs: Tab[]
  /** Selecting, closing (removes a temp tab), the menu, editing the address, drag state. */
  actions: TabRowActions
  onNewTab: () => void
  /** Closes every temp tab of the space (they go on the closed-tab stack). */
  onClear: () => void
  /** Where a drag would land: the number of rows above the line. */
  dropGap: number | null
}

/** Temporary (unpinned) tabs below the space's list. */
export function TempTabs({ tabs, actions, onNewTab, onClear, dropGap }: TempTabsProps) {
  // The whole group takes drops, so the gaps between rows and the New Tab button count too.
  const { setNodeRef } = useTabDropZone("temp", { kind: "temp" })

  return (
    <>
      {tabs.length > 0 ? (
        <TempHeader count={tabs.length} onClear={onClear} />
      ) : (
        // The separator primitive's data-horizontal:w-full outranks SidebarSeparator's w-auto, so its mx-2 overflowed.
        <SidebarSeparator className="shrink-0 data-horizontal:w-auto" />
      )}
      {/* Scrolls on its own, below the space's pinned list (the widget lays the two out). */}
      <ScrollArea>
      <SidebarGroup ref={setNodeRef}>
        <SidebarGroupContent>
          {/* 2px between rows; the drop line fills that gap. */}
          <SidebarMenu className="gap-0.5">
            {/* New rows grow in, closed ones collapse (DraggableTabItem). Rows already here when the
                list mounts (launch, a space switch: the widget keys it by space) just show. */}
            <AnimatePresence initial={false}>
              {tabs.map((tab, index) => (
                <DraggableTabItem
                  key={tab.id}
                  tab={tab}
                  source="temp"
                  actions={actions}
                  indicator={rowIndicator(dropGap, index, tabs.length)}
                />
              ))}
            </AnimatePresence>
            <SidebarMenuItem>
              {/* No temp tabs: the line goes where the first one would be. */}
              {tabs.length === 0 && dropGap === 0 && <DropIndicator edge="top" />}
              <NewTabRow onClick={onNewTab} />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      </ScrollArea>
    </>
  )
}

/**
 * The temp tabs' header, in place of the plain line above them while there are any: what the list
 * is and how long ("Tabs · 5"), and Clear, always in sight, right next to what it empties (HIG:
 * a control sits by the content it acts on). Small and quiet (11px, 50% ink) so it reads as a
 * label, not a row. Undoable rather than asked about (HIG alerts.md: no alert for a common,
 * undoable action): the tabs go on the closed-tab stack, and the widget's toast names Ctrl+Shift+T.
 */
function TempHeader({ count, onClear }: { count: number; onClear: () => void }) {
  return (
    <div className="flex h-7 shrink-0 items-center justify-between px-4 pt-1 text-[11px] font-medium text-sidebar-foreground/50">
      <span className="tabular-nums">
        Tabs <span className="text-sidebar-foreground/35">·</span> {count}
      </span>
      <button
        type="button"
        aria-label={`Close ${count} temporary ${count === 1 ? "tab" : "tabs"}`}
        title="Close all temporary tabs"
        onClick={onClear}
        className="-mr-1.5 h-5 cursor-pointer rounded-md px-1.5 outline-none transition-colors duration-(--motion-fast) ease-ezel-out hover:bg-sidebar-foreground/8 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring motion-reduce:transition-none"
      >
        Clear
      </button>
    </div>
  )
}

/**
 * The next tab, not painted yet: a row like the tabs above it (full width, 32px, a 16px icon slot,
 * a label) with no fill at rest. Its icon is an empty favicon: an outlined circle, the same one a
 * site without a favicon gets, holding a small +. A blank canvas on the easel. Hovering gives it a
 * row's hover; the canvas fills in and the label comes up to full strength.
 * Quiet on purpose: it's always there, so it mustn't compete with the tabs (HIG buttons.md: keep
 * prominence for the most likely action). The resting label is 55% foreground, about 5.7:1 on the
 * dark sidebar (HIG dark-mode.md: at least 4.5:1); the old filled, inset button was 40% (3.6:1).
 */
function NewTabRow({ onClick }: { onClick: () => void }) {
  return (
    <SidebarMenuButton
      onClick={onClick}
      className="group/new-tab text-sidebar-foreground/55 transition-colors duration-(--motion-base) hover:text-sidebar-foreground motion-reduce:transition-none"
    >
      <span
        aria-hidden
        className="flex size-4 shrink-0 items-center justify-center rounded-full ring-1 ring-sidebar-foreground/30 ring-inset transition-colors duration-(--motion-base) group-hover/new-tab:bg-sidebar-foreground/12 group-hover/new-tab:ring-sidebar-foreground/0 motion-reduce:transition-none"
      >
        <Plus className="size-2.5! stroke-[2.5]" />
      </span>
      <span>New Tab</span>
    </SidebarMenuButton>
  )
}
