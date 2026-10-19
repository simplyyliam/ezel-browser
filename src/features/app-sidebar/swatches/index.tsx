import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { Favicon, tabLabel } from "@/shared/components"
import type { Id, Swatch } from "@/shared"

/** The grid holds at most 8 swatches: 4 columns x 2 rows. */
const MAX_SWATCHES = 8

type SwatchesProps = {
  /** One entry per slot; null = empty cell. */
  swatches: Swatch[]
  activeTabId: Id | null
  onSelect: (tabId: Id) => void
}

/** The top grid of pinned favourites, shared by every space. Unloaded swatches show dimmed. */
export function Swatches({ swatches, activeTabId, onSelect }: SwatchesProps) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu aria-label="Swatches" className="grid grid-cols-4 gap-1">
          {swatches.slice(0, MAX_SWATCHES).map((tab, slot) => (
            // Keyed by slot: empty cells have no tab id.
            <SidebarMenuItem key={slot}>
              <SidebarMenuButton
                aria-label={tab ? tabLabel(tab) : "Empty swatch"}
                title={tab ? tabLabel(tab) : undefined}
                isActive={tab !== null && tab.id === activeTabId}
                aria-current={tab !== null && tab.id === activeTabId ? "page" : undefined}
                disabled={!tab}
                onClick={tab ? () => onSelect(tab.id) : undefined}
                className={cn(
                  "justify-center bg-sidebar-foreground/5 p-0 hover:bg-sidebar-foreground/8 disabled:opacity-100",
                  "data-active:bg-sidebar-foreground/12",
                  tab && !tab.isLoaded && "[&_img]:opacity-50",
                )}
              >
                {tab && <Favicon src={tab.favicon} className="size-[18px]" />}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
