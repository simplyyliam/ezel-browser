import { useEffect, useRef } from "react"
import { setContentCutout } from "./tauri"

/** True while a CSS transition/animation runs on `el` or an ancestor (which would move it). */
const isMoving = (el: Element) =>
  document.getAnimations().some((a) => {
    const target = (a.effect as KeyframeEffect | null)?.target
    return target instanceof Element && target.contains(el)
  })

/**
 * Keeps a hole the shape of an element cut out of the website webview, so that UI drawn there shows
 * above the page (the native webview is otherwise drawn over all UI). Follows the element every frame
 * while it, or an ancestor, is transitioning; resize observers alone miss position changes.
 *
 * @param id     one hole per id ("titlebar", "sidebar")
 * @param getEl  returns the element to cut out (read after mount)
 * @param inflate grow the hole by this many px, e.g. to include a 1px ring drawn outside the element
 */
export function useContentCutout(id: string, getEl: () => HTMLElement | null, inflate = 0) {
  const getElRef = useRef(getEl)
  useEffect(() => {
    getElRef.current = getEl
  })

  useEffect(() => {
    const el = getElRef.current()
    if (!el) return

    let frame = 0
    let last = ""
    const report = () => {
      frame = 0
      const r = el.getBoundingClientRect()
      const radius = (parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0) + inflate
      const rect: [number, number, number, number] = [
        r.left - inflate,
        r.top - inflate,
        r.width + inflate * 2,
        r.height + inflate * 2,
      ]
      const key = JSON.stringify([rect, radius])
      if (key !== last) {
        last = key
        setContentCutout(id, rect, radius)
      }
      if (isMoving(el)) frame = requestAnimationFrame(report)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(report)
    }
    const onTransition = (event: Event) => {
      if (event.target instanceof Node && event.target.contains(el)) schedule()
    }

    schedule()
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    window.addEventListener("resize", schedule)
    document.addEventListener("transitionrun", onTransition, true)
    document.addEventListener("transitionend", onTransition, true)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener("resize", schedule)
      document.removeEventListener("transitionrun", onTransition, true)
      document.removeEventListener("transitionend", onTransition, true)
      setContentCutout(id, null)
    }
  }, [id, inflate])
}
