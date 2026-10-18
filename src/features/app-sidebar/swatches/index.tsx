import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Favicon } from "@/shared/components"
import type { Swatch } from "@/shared"

/** The grid holds at most 8 swatches: 4 columns x 2 rows. */
const MAX_SWATCHES = 8

type SwatchesProps = {
  swatches: Swatch[]
}

/** The top grid of pinned favourites. Placeholder only: clicking does nothing yet. */
export function Swatches({ swatches }: SwatchesProps) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu aria-label="Swatches" className="grid grid-cols-4 gap-1">
          {swatches.slice(0, MAX_SWATCHES).map((swatch) => (
            <SidebarMenuItem key={swatch.id}>
              {/* TODO: open the swatch's tab once real tab state exists. */}
              <SidebarMenuButton
                aria-label={swatch.tab?.title ?? "Empty swatch"}
                className="justify-center bg-sidebar-foreground/5 p-0 hover:bg-sidebar-foreground/8"
              >
                {swatch.tab && <Favicon src={swatch.tab.favicon} className="size-[18px]" />}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
