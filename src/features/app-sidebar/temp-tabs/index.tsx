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
            <SidebarMenuItem className="mt-1 px-3">
              {/* No temp tabs: the line goes where the first one would be. */}
              {tabs.length === 0 && dropGap === 0 && <DropIndicator edge="top" className="-top-[3px]" />}
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
