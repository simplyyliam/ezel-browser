import { Plus } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { DraggableTabItem, DropIndicator } from "@/shared/components"
import { rowIndicator, useTabDropZone, type Id, type Tab } from "@/shared"

type TempTabsProps = {
  /** The active space's temp tabs, newest first. */
  tabs: Tab[]
  activeTabId: Id | null
  onSelect: (tabId: Id) => void
  /** Temp tabs are removed on close. */
  onClose: (tabId: Id) => void
  onNewTab: () => void
  /** The tab being dragged (or just dropped, until the backend moves it). */
  draggedTabId: Id | null
  /** Where a drag would land: the number of rows above the line. */
  dropGap: number | null
}

/** Temporary (unpinned) tabs below the space's list. */
export function TempTabs({ tabs, activeTabId, onSelect, onClose, onNewTab, draggedTabId, dropGap }: TempTabsProps) {
  // The whole group takes drops, so the gaps between rows and the New Tab button count too.
  const { setNodeRef } = useTabDropZone("temp", { kind: "temp" })

  return (
    <>
      {/* The separator primitive's data-horizontal:w-full outranks SidebarSeparator's w-auto, so its mx-2 overflowed. */}
      <SidebarSeparator className="data-horizontal:w-auto" />
      <SidebarGroup ref={setNodeRef}>
        <SidebarGroupContent>
          <SidebarMenu>
            {tabs.map((tab, index) => (
              <DraggableTabItem
                key={tab.id}
                tab={tab}
                source="temp"
                active={tab.id === activeTabId}
                onSelect={() => onSelect(tab.id)}
                onClose={() => onClose(tab.id)}
                isDragged={tab.id === draggedTabId}
                indicator={rowIndicator(dropGap, index, tabs.length)}
              />
            ))}
            <SidebarMenuItem className="mt-1 px-3">
              {/* No temp tabs: the line goes where the first one would be. */}
              {tabs.length === 0 && dropGap === 0 && <DropIndicator edge="top" className="-top-0.5" />}
              {/* Deliberately inset and dimmed: available, but not the focus. */}
              <SidebarMenuButton
                onClick={onNewTab}
                className="bg-sidebar-foreground/[0.025] text-sidebar-foreground/40 hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground/60"
              >
                <Plus aria-hidden />
                <span>New Tab</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  )
}
