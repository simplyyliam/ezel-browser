import { useEffect, useLayoutEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"
import { Favicon, tabLabel } from "@/shared/components"
import { SWATCH_GRID, swatchCellWidth } from "@/shared"
import type { PreviewShape, TabDrag } from "./use-tab-drag"

/** A swatch cell in a full row (SWATCH_GRID). The sidebar's width sets it, as in the grid. */
function swatchBox(sidebar: DOMRect | null) {
  const content = sidebar ? sidebar.width - GROUP_PADDING * 2 : 228
  return { width: swatchCellWidth(content, SWATCH_GRID.columns), height: SWATCH_GRID.height }
}
/** shadcn's menu button row. */
const ROW_HEIGHT = 32
/** The sidebar group's padding (shadcn p-2): rows sit this far inside the card. */
const GROUP_PADDING = 8
/** The titlebar peek's timing (PEEK_TRANSITION), for the shape change and the slide back. */
const DURATION = 150

type Box = { x: number; y: number; width: number; height: number }

/**
 * Where the preview sits for a pointer position. A row stays in the sidebar's column and keeps the
 * grab point's height; a tile follows the pointer, clamped inside the card. Changing shape centres
 * the new one on the pointer.
 */
function boxAt(drag: TabDrag, shape: PreviewShape, pointer: { x: number; y: number }, sidebar: DOMRect | null): Box {
  const fromSwatch = drag.source === "swatch"
  if (shape === "row") {
    const x = fromSwatch && sidebar ? sidebar.left + GROUP_PADDING : drag.sourceRect.left
    const width = fromSwatch && sidebar ? sidebar.width - GROUP_PADDING * 2 : drag.sourceRect.width
    return { x, y: pointer.y - (fromSwatch ? ROW_HEIGHT / 2 : drag.grab.y), width, height: ROW_HEIGHT }
  }
  // A swatch from a shorter row is wider; while dragged it takes a full row's cell size.
  const tile = swatchBox(sidebar)
  let x = pointer.x - (fromSwatch ? Math.min(drag.grab.x, tile.width / 2) : tile.width / 2)
  if (sidebar) x = Math.min(Math.max(x, sidebar.left), sidebar.right - tile.width)
  return { x, y: pointer.y - (fromSwatch ? drag.grab.y : tile.height / 2), ...tile }
}

type TabDragPreviewProps = {
  drag: TabDrag
  shape: PreviewShape
  /** Cancelled: slide back to the source, then call `onReturned`. */
  returning: boolean
  /** The source is still on screen to slide back to. */
  canReturn: boolean
  onReturned: () => void
  getSidebar: () => HTMLElement | null
}

/**
 * What follows the pointer while a tab is dragged (dnd-kit moves nothing itself here). It turns
 * into a swatch tile over the Swatches and back into a row over the lists, like Zen's drag image.
 * Fixed, above the UI: it never leaves the sidebar card, the only part of the window the website
 * doesn't cover.
 */
export function TabDragPreview({ drag, shape, returning, canReturn, onReturned, getSidebar }: TabDragPreviewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const pointer = useRef(drag.start)
  const shapeRef = useRef(shape)

  const place = () => {
    const node = ref.current
    if (!node) return
    const box = boxAt(drag, shapeRef.current, pointer.current, getSidebar()?.getBoundingClientRect() ?? null)
    node.style.transform = `translate(${box.x}px, ${box.y}px)`
    node.style.width = `${box.width}px`
    node.style.height = `${box.height}px`
  }

  // Follow the pointer directly, without re-rendering.
  useLayoutEffect(() => {
    if (returning) return
    shapeRef.current = shape
    place()
    const onMove = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY }
      place()
    }
    window.addEventListener("pointermove", onMove)
    return () => window.removeEventListener("pointermove", onMove)
    // `place` reads refs; re-placing on a shape change is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, shape, returning])

  // Cancelled: slide back where it came from (Zen leaves this to the OS; only macOS animates it).
  useEffect(() => {
    if (!returning) return
    const node = ref.current
    if (!node || !canReturn || reduceMotion) {
      onReturned()
      return
    }
    const { left, top, width, height } = drag.sourceRect
    const animation = node.animate(
      [
        { transform: node.style.transform, width: node.style.width, height: node.style.height },
        { transform: `translate(${left}px, ${top}px)`, width: `${width}px`, height: `${height}px` },
      ],
      { duration: DURATION, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" },
    )
    animation.onfinish = onReturned
    return () => animation.cancel()
  }, [returning, canReturn, reduceMotion, drag, onReturned])

  const swatch = shape === "swatch"
  return createPortal(
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none fixed top-0 left-0 z-50 flex items-center overflow-hidden bg-sidebar-accent text-sm text-sidebar-accent-foreground ring-1 ring-sidebar-border",
        swatch ? "justify-center rounded-[9px]" : "gap-2 rounded-md px-2",
        // The size change between row and tile. Under reduced motion it applies at once.
        !reduceMotion && "transition-[width,height,border-radius] duration-(--motion-base) ease-ezel-in-out",
      )}
    >
      <Favicon src={drag.tab.favicon} />
      {!swatch && <span className="truncate">{tabLabel(drag.tab)}</span>}
    </div>,
    document.body,
  )
}
