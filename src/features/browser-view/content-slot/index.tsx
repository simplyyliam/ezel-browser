import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { setContentBounds, setContentRadius, setContentVisible } from "@/shared"

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
      const calls: Promise<void>[] = []
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

    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    window.addEventListener("resize", schedule)

    return () => {
      mounted = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener("resize", schedule)
      setContentVisible(false)
    }
  }, [])

  return <div ref={ref} className={cn("w-full flex-1", className)} />
}
