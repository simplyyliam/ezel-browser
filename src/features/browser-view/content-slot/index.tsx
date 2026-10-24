import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { dropCover, unwrap, usePageCover, useWindowRadius } from "@/shared"
import { commands } from "@/shared/bindings"

const setContentBounds = (x: number, y: number, width: number, height: number) =>
  unwrap("set content bounds", commands.setContentBounds(x, y, width, height))
const setContentRadius = (radii: [number, number, number, number]) =>
  unwrap("set content radius", commands.setContentRadius(radii))
const setContentVisible = (visible: boolean) => unwrap("set content visible", commands.setContentVisible(visible))

type Rect = { x: number; y: number; width: number; height: number }
type Radii = [number, number, number, number]

const sameRect = (a: Rect | null, b: Rect) =>
  a !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

const sameRadii = (a: Radii | null, b: Radii) => a !== null && a.every((r, i) => r === b[i])

/** The slot's CSS corner radii in px, in CSS order. */
function readRadii(el: HTMLElement): Radii {
  const s = getComputedStyle(el)
  return [
    s.borderTopLeftRadius,
    s.borderTopRightRadius,
    s.borderBottomRightRadius,
    s.borderBottomLeftRadius,
  ].map((r) => parseFloat(r) || 0) as Radii
}

type ContentSlotProps = {
  /** Corner radius classes here also clip the website. */
  className?: string
}

/** Placeholder for the native content webview: Rust places the website over this div. */
export function ContentSlot({ className }: ContentSlotProps) {
  const ref = useRef<HTMLDivElement>(null)
  const scheduleRef = useRef<() => void>(undefined)
  // The frame radius can change without a resize (mod toggled), so re-measure on change.
  const { radius } = useWindowRadius()

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let mounted = true
    let frame = 0
    let last: Rect | null = null
    let lastRadii: Radii | null = null

    const measure = async () => {
      const { x, y, width, height } = el.getBoundingClientRect()
      const rect = { x, y, width, height }
      const radii = readRadii(el)
      const calls: Promise<unknown>[] = []
      if (!sameRect(last, rect)) {
        last = rect
        calls.push(setContentBounds(x, y, width, height))
      }
      if (!sameRadii(lastRadii, radii)) {
        lastRadii = radii
        calls.push(setContentRadius(radii))
      }
      await Promise.all(calls)
    }

    // At most one measurement per animation frame.
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    }

    // Report bounds and radii before showing, so the website never appears at its old position.
    measure().then(() => {
      if (mounted) setContentVisible(true)
    })

    scheduleRef.current = schedule
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    window.addEventListener("resize", schedule)

    return () => {
      mounted = false
      scheduleRef.current = undefined
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener("resize", schedule)
      setContentVisible(false)
    }
  }, [])

  useEffect(() => scheduleRef.current?.(), [radius])

  // The page's picture in its place (shared/page-cover): the page hides once the picture is on
  // screen, and comes back before the picture goes, so the swap never shows.
  const cover = usePageCover()
  useEffect(() => {
    if (cover && !cover.covered) setContentVisible(true).then(() => requestAnimationFrame(dropCover))
  }, [cover])

  // The slot marks where the page is (usePopupCutouts asks whether a popup reaches over it).
  return (
    <div ref={ref} data-slot="content-slot" className={cn("relative w-full flex-1 overflow-hidden", className)}>
      {cover && (
        <img
          src={cover.image}
          alt=""
          aria-hidden
          draggable={false}
          // Decoded and drawn by now: the real page can go.
          onLoad={() => cover.covered && setContentVisible(false)}
          className="pointer-events-none absolute inset-0 size-full select-none"
        />
      )}
    </div>
  )
}
