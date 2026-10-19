import { Plus } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { TabRow } from "@/shared/components"
import type { Id, Tab } from "@/shared"

type TempTabsProps = {
  /** The active space's temp tabs, newest first. */
  tabs: Tab[]
  activeTabId: Id | null
  onSelect: (tabId: Id) => void
  /** Temp tabs are removed on close. */
  onClose: (tabId: Id) => void
  onNewTab: () => void
}

/** Temporary (unpinned) tabs below the space's list. */
export function TempTabs({ tabs, activeTabId, onSelect, onClose, onNewTab }: TempTabsProps) {
  return (
    <>
      {/* The separator primitive's data-horizontal:w-full outranks SidebarSeparator's w-auto, so its mx-2 overflowed. */}
      <SidebarSeparator className="data-horizontal:w-auto" />
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {tabs.map((tab) => (
              <SidebarMenuItem key={tab.id}>
                <TabRow
                  tab={tab}
                  active={tab.id === activeTabId}
                  onSelect={() => onSelect(tab.id)}
                  onClose={() => onClose(tab.id)}
                />
              </SidebarMenuItem>
            ))}
            <SidebarMenuItem className="mt-1 px-3">
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
