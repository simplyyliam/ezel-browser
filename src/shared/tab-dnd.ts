import { useCallback } from "react"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import type { Id, Tab } from "./types"

// Tab drag and drop (docs/design/drag-and-drop.md). The DndContext and every decision live in
// widgets/app-sidebar; features only register what can be dragged and where it can land, and draw
// the indicator the widget passes them.

/** Where a dragged tab comes from. Folder tabs can be dragged out; nothing drops into a folder yet. */
export type TabDragSource = "swatch" | "pinned" | "folder" | "temp"

export type TabDragData = { tab: Tab; source: TabDragSource }

/** An area a tab can be dropped on. Lists work out the gap from their rows (`DROP_ROW`). */
export type TabDropZone =
  /** The Swatches grid, only while it has swatches. Drops insert; the cells make room. */
  | { kind: "swatches" }
  | { kind: "pinned" }
  | { kind: "temp" }
  /** Hovering switches to the space; dropping on it does nothing. */
  | { kind: "space"; spaceId: Id }

/**
 * Where the drop would land, for the indicators. `gap` counts the list's rows above the line, as
 * they're displayed (the dragged row included). `index` is the place in the Swatches grid among
 * the other swatches (the dragged one left out).
 */
export type TabDropTarget =
  | { kind: "swatches"; index: number }
  | { kind: "pinned"; gap: number }
  | { kind: "temp"; gap: number }

/** Marks a list's rows (top-level only: a folder and its open tabs are one row). */
export const DROP_ROW = { "data-drop-row": "" }
export const DROP_ROW_SELECTOR = "[data-drop-row]"

const dragId = (tabId: Id) => `tab-${tabId}`

const dragNodes = new Map<Id, HTMLElement>()

/** Makes an element drag `tab`: spread `listeners` on it and pass `setNodeRef` as its ref. */
export function useTabDraggable(tab: Tab, source: TabDragSource) {
  const data: TabDragData = { tab, source }
  const { setNodeRef: setDraggableRef, listeners } = useDraggable({ id: dragId(tab.id), data })
  const setNodeRef = useCallback(
    (node: HTMLElement | null) => {
      setDraggableRef(node)
      if (node) dragNodes.set(tab.id, node)
      else dragNodes.delete(tab.id)
    },
    [tab.id, setDraggableRef],
  )
  return { setNodeRef, listeners }
}

/**
 * A dragged tab's element. dnd-kit measures it only after `onDragStart` (`active.rect` is still
 * null there), so the widget measures it itself.
 */
export const tabDragNode = (tabId: Id) => dragNodes.get(tabId) ?? null

const zoneNodes = new Map<string, HTMLElement>()

/** Makes an element a drop zone (pass `setNodeRef` as its ref); `isOver` while the pointer is on it during a drag. */
export function useTabDropZone(id: string, zone: TabDropZone) {
  const { setNodeRef, isOver } = useDroppable({ id, data: zone })
  const ref = useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node)
      if (node) zoneNodes.set(id, node)
      else zoneNodes.delete(id)
    },
    [id, setNodeRef],
  )
  return { setNodeRef: ref, isOver }
}

/** A mounted drop zone's element, so the widget can measure the rows inside it. */
export const tabDropZoneNode = (id: string) => zoneNodes.get(id) ?? null

/** The drop line for row `index` of `count`: the gap above it, or below the last row. */
export function rowIndicator(gap: number | null, index: number, count: number): "top" | "bottom" | null {
  if (gap === index) return "top"
  if (gap === count && index === count - 1) return "bottom"
  return null
}

/** The Swatches grid: the design's 45x27 cells, at most 4 per row, 3px apart. */
export const SWATCH_GRID = { columns: 4, width: 45, height: 27, gap: 3 } as const

/**
 * The grid's columns for `cells` cells, as CSS and as a count. Fewer than a full row share the
 * whole width (one swatch spans it, two take half each...), so the grid grows into its cells as
 * swatches join; from a full row on they're the design's 45px cells, left-aligned.
 */
export function swatchColumns(cells: number) {
  const { columns, width } = SWATCH_GRID
  const count = Math.max(Math.min(cells, columns), 1)
  return {
    count,
    fluid: count < columns,
    template: count < columns ? `repeat(${count}, minmax(0, 1fr))` : `repeat(${columns}, ${width}px)`,
  }
}

/**
 * Where a drop at a point in the Swatches grid (`grid` = its rect, full width) inserts among
 * `count` other swatches: the cell boundary nearest the pointer in its row, clamped to `count`
 * (the free space after the last one). Measured on the grid as it looks with the gap open
 * (count + 1 cells), so cells moving aside don't move the target under the pointer.
 */
export function swatchIndexAt(grid: DOMRect, x: number, y: number, count: number): number {
  const { height, gap } = SWATCH_GRID
  const columns = swatchColumns(count + 1)
  const width = columns.fluid ? (grid.width - gap * (columns.count - 1)) / columns.count : SWATCH_GRID.width
  const column = Math.min(Math.max(Math.round((x - grid.left + gap / 2) / (width + gap)), 0), columns.count)
  const row = Math.max(Math.floor((y - grid.top + gap / 2) / (height + gap)), 0)
  return Math.min(row * columns.count + column, count)
}
