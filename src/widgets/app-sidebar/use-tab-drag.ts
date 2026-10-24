import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Active,
  type DndContextProps,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Over,
} from "@dnd-kit/core"
import { commands } from "@/shared/bindings"
import { tabLabel } from "@/shared/components"
import { hasFreeSlot, insertSwatch, swatchOrder } from "./swatch-moves"
import {
  DROP_ROW_SELECTOR,
  FOLDER_EDGE,
  FOLDER_ROW_SELECTOR,
  FOLDER_TAB_ROW_SELECTOR,
  FOLDER_TABS_SELECTOR,
  getCursorPosition,
  getWindowClientRect,
  reportError,
  swatchIndexAt,
  unwrap,
  tabDragNode,
  tabDropZoneNode,
  type Id,
  type Space,
  type Tab,
  type TabDragData,
  type TabDragSource,
  type TabDropTarget,
  type TabDropZone,
  type TabLocation,
  type TabsState,
} from "@/shared"

// Tab drag and drop between Swatches, pinned and temp tabs: Zen's behaviour, rebuilt on dnd-kit
// (Tauri's drag-drop handler on Windows swallows HTML5 drag events). See docs/design/drag-and-drop.md.

/**
 * Zen: zen.tabs.dnd-switch-space-delay. How long a dragged tab must rest on a folded space's title
 * to open it, or on a space's dot or list row to switch there (macOS spring-loading).
 */
const SPACE_SWITCH_DELAY = 500
/** A press must move this far before it drags, so clicks and the close button still work. */
const DRAG_DISTANCE = 4

export type TabDrag = {
  tab: Tab
  source: TabDragSource
  /** The source element's rect when the drag started; a cancelled drag slides back to it. */
  sourceRect: DOMRect
  /** Where the press landed inside the source element. */
  grab: { x: number; y: number }
  /** The pointer when the drag started. */
  start: { x: number; y: number }
  /** The space shown when the drag started (a switch hides list sources; no slide back then). */
  spaceId: Id
}

/** The preview's shape follows the area under it: a tile over the Swatches, a row elsewhere (Zen). */
export type PreviewShape = "swatch" | "row"

/**
 * A drop on its way through the backend: the tab stays where the drag showed it until it's done.
 * `tabs` is the state at the drop. `swatchIndex`: dropped into the grid, which keeps showing that
 * state with the gap until the moves are `settled` (the moves in between would shuffle it).
 */
type Landing = { tabId: Id; tabs: TabsState; swatchIndex: number | null; settled: boolean }

const pointOf = (event: Event | null) =>
  event instanceof PointerEvent || event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : { x: 0, y: 0 }

const inside = (rect: DOMRect, { x, y }: { x: number; y: number }) =>
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom

/** Rows of a list zone whose middle is above `y`: the gap a drop would go into. */
function gapAt(zoneId: string, y: number): number | null {
  const node = tabDropZoneNode(zoneId)
  if (!node) return null
  let gap = 0
  for (const row of node.querySelectorAll(DROP_ROW_SELECTOR)) {
    const rect = row.getBoundingClientRect()
    if (y > rect.top + rect.height / 2) gap++
  }
  return gap
}

/** Rows of `list` whose middle is above `y`. */
function rowsAbove(list: Element, selector: string, y: number): number {
  let gap = 0
  for (const row of list.querySelectorAll(selector)) {
    const rect = row.getBoundingClientRect()
    if (y > rect.top + rect.height / 2) gap++
  }
  return gap
}

/**
 * A drop into a folder at `y` in the pinned list (Zen): the middle of a folder's row goes into it
 * (at the end), its top and bottom 20% beside it (null: the list's own gap decides), except the
 * bottom edge of an open folder, which is its first place. Among a folder's open tabs, the gap
 * between them.
 */
function folderTargetAt(y: number): { folderId: Id; gap: number | null } | null {
  const zone = tabDropZoneNode("pinned")
  if (!zone) return null
  for (const row of zone.querySelectorAll<HTMLElement>(FOLDER_ROW_SELECTOR)) {
    const rect = row.getBoundingClientRect()
    if (y < rect.top || y > rect.bottom) continue
    const folderId = Number(row.dataset.folderRow)
    const at = (y - rect.top) / rect.height
    if (at > FOLDER_EDGE && at < 1 - FOLDER_EDGE) return { folderId, gap: null }
    if (at >= 1 - FOLDER_EDGE && row.getAttribute("aria-expanded") === "true") return { folderId, gap: 0 }
    return null
  }
  for (const list of zone.querySelectorAll<HTMLElement>(FOLDER_TABS_SELECTOR)) {
    const rect = list.getBoundingClientRect()
    if (y < rect.top || y > rect.bottom) continue
    return { folderId: Number(list.dataset.folderTabs), gap: rowsAbove(list, FOLDER_TAB_ROW_SELECTOR, y) }
  }
  return null
}

/** A folder's tabs, as displayed. */
function folderTabsOf(space: Space, folderId: Id): Tab[] {
  for (const item of space.items) if (item.kind === "folder" && item.folder.id === folderId) return item.folder.tabs
  return []
}

/** Where the dragged tab sits in a list, as displayed (top-level items for the pinned list). */
function indexIn(list: "pinned" | "temp", space: Space, tabId: Id): number {
  return list === "pinned"
    ? space.items.findIndex((item) => item.kind === "tab" && item.tab.id === tabId)
    : space.tempTabs.findIndex((tab) => tab.id === tabId)
}

/**
 * The tab drag for the sidebar's DndContext. Returns the context's props, what the features draw
 * (dragged tab, drop target, hovered space) and the drag for the preview.
 * - Drops are `move_tab` commands; the view moves when the backend's state arrives. Until then the
 *   tab stays where it was, dimmed or hidden like during the drag.
 * - The native website webview covers everything past the sidebar and eats pointer events, so the
 *   pointer leaving the sidebar (or the document, or the window losing focus) cancels the drag.
 */
export function useTabDrag({
  tabs,
  space,
  getSidebar,
  onSpringOpenSpace,
}: {
  tabs: TabsState | null
  space: Space | undefined
  /** The sidebar card: the area a drag stays in. */
  getSidebar: () => HTMLElement | null
  /** Opens the shown space's folded pinned list (a drag rested on its title). */
  onSpringOpenSpace: () => void
}) {
  const [drag, setDrag] = useState<TabDrag | null>(null)
  const [target, setTarget] = useState<TabDropTarget | null>(null)
  const [shape, setShape] = useState<PreviewShape>("row")
  const [dropSpaceId, setDropSpaceId] = useState<Id | null>(null)
  const [landing, setLanding] = useState<Landing | null>(null)
  /** A cancelled drag whose preview is sliding back; the source stays hidden until it lands. */
  const [returning, setReturning] = useState(false)

  // Handlers read the latest values without re-subscribing.
  const latest = useRef({ drag, space })
  useLayoutEffect(() => {
    latest.current = { drag, space }
  })
  /** The pointer, kept current while dragging (window listener below). */
  const pointer = useRef({ x: 0, y: 0 })
  const switchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** What the drag rests on, waiting: a folded space's title ("header", opens it) or a space's chip (switches). */
  const pendingSpring = useRef<"header" | Id | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE } }))

  function clearSpaceSwitch() {
    clearTimeout(switchTimer.current)
    pendingSpring.current = null
    setDropSpaceId(null)
  }

  /** What dropping now would do, from the zone under the pointer. Null = nothing (a no-op counts). */
  function resolve(over: Over | null, data: Pick<TabDragData, "tab" | "source">) {
    const zone = over?.data.current as TabDropZone | undefined
    const space = latest.current.space
    if (!zone || !space) return { zone, target: null }
    switch (zone.kind) {
      case "swatches": {
        const grid = tabDropZoneNode("swatches")
        if (!grid || !tabs) return { zone, target: null }
        const order = swatchOrder(tabs.swatches)
        const from = order.indexOf(data.tab.id)
        // Full: a tab from outside doesn't fit, so the grid doesn't make room (Zen).
        if (from < 0 && !hasFreeSlot(tabs.swatches)) return { zone, target: null }
        const others = from < 0 ? order.length : order.length - 1
        const index = swatchIndexAt(grid.getBoundingClientRect(), pointer.current.x, pointer.current.y, others)
        return { zone, target: { kind: "swatches", index } as const }
      }
      case "pinned":
      case "temp": {
        const folder = zone.kind === "pinned" ? folderTargetAt(pointer.current.y) : null
        if (folder) {
          const from = folderTabsOf(space, folder.folderId).findIndex((tab) => tab.id === data.tab.id)
          // Already there: into its own folder, or right above or below itself in it.
          if (from >= 0 && (folder.gap === null || folder.gap === from || folder.gap === from + 1)) return { zone, target: null }
          return { zone, target: { kind: "folder", ...folder } as const }
        }
        const gap = gapAt(zone.kind, pointer.current.y)
        if (gap === null) return { zone, target: null }
        const from = data.source === zone.kind ? indexIn(zone.kind, space, data.tab.id) : -1
        // Right above or below itself: nothing would change, so no line.
        if (from >= 0 && (gap === from || gap === from + 1)) return { zone, target: null }
        return { zone, target: { kind: zone.kind, gap } as const }
      }
      case "spaces":
      case "space":
        return { zone, target: null }
    }
  }

  // The tab and source come from the drag recorded at the start, never from dnd-kit's `active.data`:
  // that turns null once the source unmounts (a space switch, a swatch turning into its grid gap).
  function update({ over }: { over: Over | null }) {
    const data = latest.current.drag
    if (!data) return
    const next = resolve(over, data)
    setTarget((prev) => (JSON.stringify(prev) === JSON.stringify(next.target) ? prev : next.target))
    if (next.zone && next.zone.kind !== "space" && next.zone.kind !== "spaces") {
      setShape(next.zone.kind === "swatches" ? "swatch" : "row")
    }

    // Spring-loading: resting on a folded space's title opens it, resting on another space's chip
    // in the rail switches there. Swatches belong to every space, so they never switch (Zen).
    const zone = next.zone
    const switches = data.source !== "swatch" && (tabs?.spaces.length ?? 0) >= 2
    const spring: "header" | Id | null =
      zone?.kind === "spaces" && latest.current.space?.collapsed
        ? "header"
        : switches && zone?.kind === "space" && zone.spaceId !== latest.current.space?.id
          ? zone.spaceId
          : null
    if (spring === null) {
      if (pendingSpring.current !== null) clearSpaceSwitch()
      return
    }
    if (pendingSpring.current === spring) return
    clearTimeout(switchTimer.current)
    pendingSpring.current = spring
    setDropSpaceId(spring === "header" ? null : spring)
    switchTimer.current = setTimeout(() => {
      clearSpaceSwitch()
      if (spring === "header") onSpringOpenSpace()
      else unwrap("switch space", commands.switchSpace(spring))
    }, SPACE_SWITCH_DELAY)
  }

  function finish() {
    clearSpaceSwitch()
    setTarget(null)
    setShape("row")
  }

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    const data = active.data.current as TabDragData
    // Not `active.rect`: dnd-kit fills it in after this callback, so here it's still null.
    const rect = tabDragNode(data.tab.id)?.getBoundingClientRect()
    if (!rect || !space) return
    const start = pointOf(activatorEvent)
    pointer.current = start
    setLanding(null)
    setReturning(false)
    setShape(data.source === "swatch" ? "swatch" : "row")
    setDrag({
      tab: data.tab,
      source: data.source,
      sourceRect: rect,
      grab: { x: start.x - rect.left, y: start.y - rect.top },
      start,
      spaceId: space.id,
    })
  }

  // Over changes on its own when a space switch swaps the lists under a still pointer.
  const onDragMove = (event: DragMoveEvent) => update(event)
  const onDragOver = (event: DragOverEvent) => update(event)

  const onDragEnd = ({ over }: DragEndEvent) => {
    const space = latest.current.space
    const data = latest.current.drag
    const dropTarget = data ? resolve(over, data).target : null
    finish()
    // Released over nothing, or back where it was: same as a cancel.
    const unchanged =
      data !== null &&
      dropTarget?.kind === "swatches" &&
      swatchOrder(tabs?.swatches ?? []).indexOf(data.tab.id) === dropTarget.index
    if (!data || !space || !tabs || !dropTarget || unchanged) {
      onDragCancel()
      return
    }
    setDrag(null)
    const tabId = data.tab.id
    // Shown where the drag left it until the backend's state moves it (no optimistic copy).
    const swatchIndex = dropTarget.kind === "swatches" ? dropTarget.index : null
    setLanding({ tabId, tabs, swatchIndex, settled: false })
    const settle = () => setLanding((current) => (current?.tabId === tabId ? { ...current, settled: true } : current))
    const fail = (error: unknown) => {
      reportError("drop tab", error)
      setLanding(null)
    }

    if (dropTarget.kind === "swatches") {
      insertSwatch(tabId, dropTarget.index, tabs.swatches).then(settle, fail)
      return
    }
    // `move_tab` takes the tab out first, so a move down its own list lands one index higher.
    const lower = (gap: number, from: number) => (from >= 0 && gap > from ? gap - 1 : gap)
    let to: TabLocation
    if (dropTarget.kind === "folder") {
      const from = folderTabsOf(space, dropTarget.folderId).findIndex((tab) => tab.id === tabId)
      const index = dropTarget.gap === null ? null : lower(dropTarget.gap, from)
      to = { kind: "pinned", spaceId: space.id, folderId: dropTarget.folderId, index }
    } else {
      const from = data.source === dropTarget.kind ? indexIn(dropTarget.kind, space, tabId) : -1
      const index = lower(dropTarget.gap, from)
      to =
        dropTarget.kind === "pinned"
          ? { kind: "pinned", spaceId: space.id, folderId: null, index }
          : { kind: "temp", spaceId: space.id, index }
    }
    commands.moveTab(tabId, to).then((result) => (result.status === "error" ? fail(result.error) : settle()))
  }

  const onDragCancel = () => {
    finish()
    setReturning(true)
  }

  /** The preview finished sliding back (or had nowhere to go). */
  const onReturned = useCallback(() => {
    setReturning(false)
    setDrag(null)
  }, [])

  // While dragging: follow the pointer, and cancel as soon as it leaves the sidebar card.
  // Focus is no signal: a tab webview created mid-drag (a space switch loading its tab) takes focus
  // from the UI, and briefly covers the card before its cut-out applies. Only where the cursor
  // really is, and whether the button is still down, count.
  const dragging = drag !== null && !returning
  useEffect(() => {
    if (!dragging) return
    let active = true
    // dnd-kit's pointer sensor cancels on Escape; it has no other way to cancel from outside.
    const cancel = () => {
      if (!active) return
      active = false
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape" }))
    }
    const outsideCard = (point: { x: number; y: number }) => {
      const sidebar = getSidebar()
      return !sidebar || !inside(sidebar.getBoundingClientRect(), point)
    }
    const onMove = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY }
      // No button: it was released where we couldn't hear it (over the website, another app).
      if (event.buttons === 0 || outsideCard(pointer.current)) cancel()
    }
    // The document stops getting pointer events: the cursor went over the website or out of the
    // window, or a webview appeared under it. Ask the OS where it is.
    const onLeave = async () => {
      try {
        const [win, cursor] = await Promise.all([getWindowClientRect(), getCursorPosition()])
        if (outsideCard({ x: (cursor.x - win.x) / win.scale, y: (cursor.y - win.y) / win.scale })) cancel()
      } catch {
        cancel()
      }
    }
    window.addEventListener("pointermove", onMove, true)
    document.documentElement.addEventListener("mouseleave", onLeave)
    const cursor = document.body.style.cursor
    document.body.style.cursor = "grabbing"
    return () => {
      active = false
      window.removeEventListener("pointermove", onMove, true)
      document.documentElement.removeEventListener("mouseleave", onLeave)
      document.body.style.cursor = cursor
    }
  }, [dragging, getSidebar])

  useEffect(() => () => clearTimeout(switchTimer.current), [])

  // Landing ends once the moves are done and the backend's state has changed since the drop.
  const landingActive = landing !== null && (!landing.settled || landing.tabs === tabs)

  const dragLabel = () => (latest.current.drag ? tabLabel(latest.current.drag.tab) : "the tab")

  const context: DndContextProps = {
    sensors,
    collisionDetection: pointerWithin,
    // Lists change under the drag (a space switch swaps them), so zones are measured continuously.
    measuring: { droppable: { strategy: MeasuringStrategy.Always } },
    onDragStart,
    onDragMove,
    onDragOver,
    onDragEnd,
    onDragCancel,
    accessibility: {
      screenReaderInstructions: {
        draggable: "Drag with the pointer to move this tab to Swatches, a folder, pinned or temporary tabs.",
      },
      announcements: {
        // `active` is fine at the start; later the source may have unmounted (see update).
        onDragStart: ({ active }) => `Picked up ${labelOf(active)}.`,
        onDragOver: () => undefined,
        onDragEnd: () => `Dropped ${dragLabel()}.`,
        onDragCancel: () => `Stopped dragging ${dragLabel()}; it stays where it was.`,
      },
    },
  }

  return {
    context,
    drag,
    /** The source should look away (dimmed row, empty swatch). */
    draggedTabId: drag?.tab.id ?? (landingActive ? landing.tabId : null),
    /** Where the Swatches grid opens a gap: under the drag, or for a drop still being placed. */
    swatchIndex: target?.kind === "swatches" ? target.index : landingActive ? landing.swatchIndex : null,
    /** The slots the grid shows: frozen at the drop while a grid drop is being placed. */
    swatches: landingActive && landing.swatchIndex !== null ? landing.tabs.swatches : tabs?.swatches ?? [],
    target,
    shape,
    dropSpaceId,
    returning,
    /** The preview can slide back to its source: still on screen in the shown space. */
    canReturn: drag !== null && (drag.source === "swatch" || drag.spaceId === space?.id),
    onReturned,
  }
}

const labelOf = (active: Active) => tabLabel((active.data.current as TabDragData).tab)
