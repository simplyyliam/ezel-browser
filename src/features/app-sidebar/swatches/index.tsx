import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { Favicon, tabLabel } from "@/shared/components"
import { useTabDraggable, useTabDropZone, type Id, type Swatch, type Tab } from "@/shared"

/** The grid holds at most 8 swatches: 4 columns x 2 rows. */
const MAX_SWATCHES = 8

type SwatchesProps = {
  /** One entry per slot; null = empty cell. */
  swatches: Swatch[]
  activeTabId: Id | null
  onSelect: (tabId: Id) => void
  /** The tab being dragged (or just dropped, until the backend moves it); its cell shows empty. */
  draggedTabId: Id | null
  /** The slot a drag would land on: it shows a ring, and an occupant dims (it would swap). */
  dropSlot: number | null
}

/** The top grid of pinned favourites, shared by every space. Unloaded swatches show dimmed. */
export function Swatches({ swatches, activeTabId, onSelect, draggedTabId, dropSlot }: SwatchesProps) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu aria-label="Swatches" className="grid grid-cols-4 justify-items-center gap-y-1">
          {swatches.slice(0, MAX_SWATCHES).map((tab, slot) => (
            // Keyed by slot: empty cells have no tab id.
            <SidebarMenuItem key={slot}>
              {tab ? (
                <SwatchCell
                  slot={slot}
                  tab={tab}
                  active={tab.id === activeTabId}
                  onSelect={onSelect}
                  isDragged={tab.id === draggedTabId}
                  isDropTarget={dropSlot === slot}
                />
              ) : (
                <EmptySwatch slot={slot} isDropTarget={dropSlot === slot} />
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

type SwatchCellProps = {
  slot: number
  tab: Tab
  active: boolean
  onSelect: (tabId: Id) => void
  /** Dragged away: the cell shows empty (Zen hides it) but stays mounted, so the drag keeps its source. */
  isDragged: boolean
  isDropTarget: boolean
}

/** An occupied cell: drags its tab, and takes drops (a swap). */
function SwatchCell({ slot, tab, active, onSelect, isDragged, isDropTarget }: SwatchCellProps) {
  const { setNodeRef: setDropRef } = useTabDropZone(`swatch-${slot}`, { kind: "swatch", slot })
  const { setNodeRef: setDragRef, listeners } = useTabDraggable(tab, "swatch")
  const label = tabLabel(tab)

  return (
    <div
      ref={(node) => {
        setDropRef(node)
        setDragRef(node)
      }}
      {...listeners}
    >
      <SidebarMenuButton
        aria-label={label}
        title={label}
        isActive={active && !isDragged}
        aria-current={active ? "page" : undefined}
        onClick={() => onSelect(tab.id)}
        className={cn(
          swatchClassName,
          !tab.isLoaded && "[&_img]:opacity-50",
          isDragged && "[&>*]:invisible",
          // Occupied target: this tab would swap to where the dragged one came from.
          isDropTarget && [dropTargetClassName, "[&>*]:opacity-40"],
        )}
      >
        <Favicon src={tab.favicon} />
      </SidebarMenuButton>
    </div>
  )
}

function EmptySwatch({ slot, isDropTarget }: { slot: number; isDropTarget: boolean }) {
  const { setNodeRef } = useTabDropZone(`swatch-${slot}`, { kind: "swatch", slot })

  return (
    <div ref={setNodeRef}>
      <SidebarMenuButton
        aria-label="Empty swatch"
        disabled
        className={cn(swatchClassName, isDropTarget && dropTargetClassName)}
      />
    </div>
  )
}

/** The design's 45x27 slot with a 7.5px radius. */
const swatchClassName = cn(
  "h-[27px] w-[45px] justify-center rounded-[7.5px] bg-sidebar-foreground/5 p-0 hover:bg-sidebar-foreground/8 disabled:opacity-100",
  "data-active:bg-sidebar-foreground/12",
)
const dropTargetClassName = "ring-2 ring-sidebar-primary"
