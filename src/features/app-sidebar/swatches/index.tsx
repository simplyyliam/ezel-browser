import { motion, useReducedMotion } from "motion/react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { Favicon, TabContextMenu, tabLabel, type MenuGroups } from "@/shared/components"
import {
  INSTANT,
  PEEK_TRANSITION,
  SWATCH_GRID,
  swatchColumns,
  useTabDraggable,
  useTabDropZone,
  type Id,
  type Swatch,
  type Tab,
} from "@/shared"

type SwatchesProps = {
  /** The backend's 8 slots; null = free. Only the swatches show, in slot order, without gaps. */
  swatches: Swatch[]
  activeTabId: Id | null
  onSelect: (tabId: Id) => void
  /** The swatch's right-click menu. */
  menuFor: (tabId: Id) => MenuGroups
  /** The tab being dragged (or just dropped, until the backend has placed it). */
  draggedTabId: Id | null
  /** Where a dragged tab would go among the other swatches: the cells there slide aside for it. */
  insertIndex: number | null
}

/**
 * The top grid of pinned favourites, shared by every space. There are no empty slots to aim at:
 * it shows only the swatches there are (tabs get here by "Add to Swatches" or by dragging onto the
 * grid once it has some). They always span the sidebar's content width, edge to edge like the
 * rows below: fewer than 4 share it (Zen's essentials), from 4 on it's 4 per row. Dragging over
 * it is a live grid: the cells move apart (and narrow) to open a place, and a drop past the last
 * cell lands in the free space.
 */
export function Swatches({ swatches, activeTabId, onSelect, menuFor, draggedTabId, insertIndex }: SwatchesProps) {
  const { setNodeRef } = useTabDropZone("swatches", { kind: "swatches" })
  const reduceMotion = useReducedMotion()
  const transition = reduceMotion ? INSTANT : PEEK_TRANSITION

  const tabs = swatches.filter((swatch): swatch is Tab => swatch !== null)
  if (tabs.length === 0) return null
  // The dragged swatch leaves an empty cell where it was (Zen hides it), or where it would land.
  const draggedIndex = tabs.findIndex((tab) => tab.id === draggedTabId)
  const cells: (Tab | "gap")[] = tabs.filter((tab) => tab.id !== draggedTabId)
  const gapIndex = insertIndex ?? (draggedIndex >= 0 ? draggedIndex : null)
  if (gapIndex !== null) cells.splice(gapIndex, 0, "gap")
  // Counting the gap: a tab dragged in makes the others narrower before it lands.
  const columns = swatchColumns(cells.length)

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu
          ref={setNodeRef}
          aria-label="Swatches"
          // Full width, equal columns: fewer than 4 swatches share the row, then 4 per row.
          className="grid"
          style={{ gridTemplateColumns: columns.template, gap: SWATCH_GRID.gap }}
        >
          {cells.map((cell) => (
            <SidebarMenuItem key={cell === "gap" ? "gap" : cell.id}>
              {/* The cells slide to their new place as the gap moves, on the peek's timing. */}
              <motion.div layout="position" transition={transition}>
                {cell === "gap" ? (
                  <div aria-hidden className={swatchSize} />
                ) : (
                  <SwatchCell tab={cell} active={cell.id === activeTabId} onSelect={onSelect} menuFor={menuFor} />
                )}
              </motion.div>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

type SwatchCellProps = {
  tab: Tab
  active: boolean
  onSelect: (tabId: Id) => void
  menuFor: (tabId: Id) => MenuGroups
}

function SwatchCell({ tab, active, onSelect, menuFor }: SwatchCellProps) {
  const { setNodeRef, listeners } = useTabDraggable(tab, "swatch")
  const label = tabLabel(tab)

  return (
    <div ref={setNodeRef} {...listeners}>
      <TabContextMenu tabId={tab.id} menuFor={menuFor}>
        <SidebarMenuButton
          aria-label={label}
          title={label}
          isActive={active}
          aria-current={active ? "page" : undefined}
          onClick={() => onSelect(tab.id)}
          className={cn(
            swatchSize,
            "justify-center bg-sidebar-foreground/5 p-0 hover:bg-sidebar-foreground/8 data-active:bg-sidebar-foreground/12",
            !tab.isLoaded && "[&_img]:opacity-50",
          )}
        >
          <Favicon src={tab.favicon} />
        </SidebarMenuButton>
      </TabContextMenu>
    </div>
  )
}

/** 32px high with a 9px radius (SWATCH_GRID: the design's cell scaled to the full width); its column sets the width. */
const swatchSize = "h-8 w-full rounded-[9px]"
