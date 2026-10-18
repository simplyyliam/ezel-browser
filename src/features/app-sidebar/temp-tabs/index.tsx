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
import type { Tab } from "@/shared"

type TempTabsProps = {
  tabs: Tab[]
}

/** Temporary (unpinned) tabs below the space's list. Non-functional for now. */
export function TempTabs({ tabs }: TempTabsProps) {
  return (
    <>
      {/* The separator primitive's data-horizontal:w-full outranks SidebarSeparator's w-auto, so its mx-2 overflowed. */}
      <SidebarSeparator className="data-horizontal:w-auto" />
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {tabs.map((tab) => (
              <SidebarMenuItem key={tab.id}>
                {/* TODO: select / close the temp tab once real tab state exists. */}
                <TabRow tab={tab} />
              </SidebarMenuItem>
            ))}
            <SidebarMenuItem className="mt-1 px-3">
              {/* Deliberately inset and dimmed: available, but not the focus. TODO: open a new tab. */}
              <SidebarMenuButton className="bg-sidebar-foreground/[0.025] text-sidebar-foreground/40 hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground/60">
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
