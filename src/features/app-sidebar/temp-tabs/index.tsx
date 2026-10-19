import { Plus } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { DraggableTabItem, DropIndicator, type TabRowActions } from "@/shared/components"
import { rowIndicator, useTabDropZone, type Tab } from "@/shared"

type TempTabsProps = {
  /** The active space's temp tabs, newest first. */
  tabs: Tab[]
  /** Selecting, closing (removes a temp tab), the menu, editing the address, drag state. */
  actions: TabRowActions
  onNewTab: () => void
  /** Where a drag would land: the number of rows above the line. */
  dropGap: number | null
}

/** Temporary (unpinned) tabs below the space's list. */
export function TempTabs({ tabs, actions, onNewTab, dropGap }: TempTabsProps) {
  // The whole group takes drops, so the gaps between rows and the New Tab button count too.
  const { setNodeRef } = useTabDropZone("temp", { kind: "temp" })

  return (
    <>
      {/* The separator primitive's data-horizontal:w-full outranks SidebarSeparator's w-auto, so its mx-2 overflowed. */}
      <SidebarSeparator className="data-horizontal:w-auto" />
      <SidebarGroup ref={setNodeRef}>
        <SidebarGroupContent>
          {/* 2px between rows; the drop line fills that gap. */}
          <SidebarMenu className="gap-0.5">
            {tabs.map((tab, index) => (
              <DraggableTabItem
                key={tab.id}
                tab={tab}
                source="temp"
                actions={actions}
                indicator={rowIndicator(dropGap, index, tabs.length)}
              />
            ))}
            <SidebarMenuItem>
              {/* No temp tabs: the line goes where the first one would be. */}
              {tabs.length === 0 && dropGap === 0 && <DropIndicator edge="top" />}
              <NewTabRow onClick={onNewTab} />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
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
      className="group/new-tab text-sidebar-foreground/55 transition-colors duration-150 hover:text-sidebar-foreground motion-reduce:transition-none"
    >
      <span
        aria-hidden
        className="flex size-4 shrink-0 items-center justify-center rounded-full ring-1 ring-sidebar-foreground/30 ring-inset transition-colors duration-150 group-hover/new-tab:bg-sidebar-foreground/12 group-hover/new-tab:ring-sidebar-foreground/0 motion-reduce:transition-none"
      >
        <Plus className="size-2.5! stroke-[2.5]" />
      </span>
      <span>New Tab</span>
    </SidebarMenuButton>
  )
}
