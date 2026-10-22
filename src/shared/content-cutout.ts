import { useEffect, useRef } from "react"
import { OPEN_POPUP_SELECTOR } from "./outside-press"
import { commands } from "./bindings"

// Calls per hole id, chained: each goes out after the previous one settles, so a later call (the
// final clear) can never overtake an earlier one, even when a popup id is reused right away.
const queues = new Map<string, Promise<unknown>>()
function sendCutout(id: string, rect: [number, number, number, number] | null, radius = 0) {
  const next = (queues.get(id) ?? Promise.resolve()).then(() => commands.setContentCutout(id, rect, radius)).catch(() => {})
  queues.set(id, next)
}

/** True while a CSS transition/animation runs on `el` or an ancestor (which would move or resize it). */
const isMoving = (el: Element) =>
  document.getAnimations().some((a) => {
    const target = (a.effect as KeyframeEffect | null)?.target
    return target instanceof Element && target.contains(el)
  })

/** True when `el` and every ancestor are fully opaque (not mid fade-in or fade-out). */
function isOpaque(el: Element) {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (parseFloat(getComputedStyle(node).opacity) < 1) return false
  }
  return true
}

type Box = { left: number; top: number; right: number; bottom: number }

/** Where `now` overlaps `next`; empty boxes come out with right <= left or bottom <= top. */
const intersect = (now: Box, next: Box): Box => ({
  left: Math.max(now.left, next.left),
  top: Math.max(now.top, next.top),
  right: Math.min(now.right, next.right),
  bottom: Math.min(now.bottom, next.bottom),
})

/**
 * Keeps a hole the shape of `el` cut out of the website webview, so UI drawn there shows above the
 * page (the native webview is otherwise drawn over all UI). Follows the element every frame while
 * it, or an ancestor, is transitioning or animating; resize observers alone miss position changes.
 * Returns a function that stops tracking and clears the hole.
 *
 * Under the page lies Ezel's own background (near-black in dark mode), so the hole must never show
 * more than the element covers: no hole while it fades in or out (the page stays until it's
 * opaque), and while it moves only the part it covers now and next frame (the hole lands a frame
 * or two late, so a hole at its current rect trails behind it).
 *
 * @param id      one hole per id ("titlebar", "sidebar", ...)
 * @param inflate grow the hole by this many px, e.g. to include a 1px ring drawn outside the element
 */
export function trackContentCutout(id: string, el: HTMLElement, inflate = 0): () => void {
  let frame = 0
  let last = ""
  // The rect one frame ago while moving, to guess where the element is going.
  let previous: Box | null = null
  const report = () => {
    frame = 0
    const moving = isMoving(el)
    const r = el.getBoundingClientRect()
    const now = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    const box = moving && previous
      ? intersect(now, {
          left: 2 * now.left - previous.left,
          top: 2 * now.top - previous.top,
          right: 2 * now.right - previous.right,
          bottom: 2 * now.bottom - previous.bottom,
        })
      : now
    previous = moving ? now : null
    const radius = (parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0) + inflate
    const rect: [number, number, number, number] | null =
      isOpaque(el) && box.right > box.left && box.bottom > box.top
        ? [box.left - inflate, box.top - inflate, box.right - box.left + inflate * 2, box.bottom - box.top + inflate * 2]
        : null
    const key = JSON.stringify([rect, radius])
    if (key !== last) {
      last = key
      sendCutout(id, rect, radius)
    }
    if (moving) frame = requestAnimationFrame(report)
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(report)
  }
  const onMotion = (event: Event) => {
    if (event.target instanceof Node && event.target.contains(el)) schedule()
  }

  schedule()
  const observer = new ResizeObserver(schedule)
  observer.observe(el)
  window.addEventListener("resize", schedule)
  for (const type of ["transitionrun", "transitionend", "animationstart", "animationend"]) {
    document.addEventListener(type, onMotion, true)
  }
  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    window.removeEventListener("resize", schedule)
    for (const type of ["transitionrun", "transitionend", "animationstart", "animationend"]) {
      document.removeEventListener(type, onMotion, true)
    }
    sendCutout(id, null)
  }
}

/**
 * `trackContentCutout` for an element owned by a component. Follows the element when it's replaced:
 * shadcn's Sidebar swaps its card for a mobile sheet below 768px (a minimized window) and mounts
 * a new card on restore, which the old tracker never saw.
 *
 * @param getEl returns the element to cut out (read after mount and after DOM changes)
 */
export function useContentCutout(id: string, getEl: () => HTMLElement | null, inflate = 0) {
  const getElRef = useRef(getEl)
  useEffect(() => {
    getElRef.current = getEl
  })

  useEffect(() => {
    let el: HTMLElement | null = null
    let stop: (() => void) | undefined
    const sync = () => {
      const next = getElRef.current()
      if (next === el) return
      stop?.()
      stop = undefined
      el = next
      if (el) stop = trackContentCutout(id, el, inflate)
    }

    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      stop?.()
    }
  }, [id, inflate])
}

/** Popup holes reuse these ids (lowest free first), so a fresh UI can clear them all. */
const POPUP_IDS = Array.from({ length: 8 }, (_, i) => `popup-${i}`)

/**
 * Cuts every open popup out of the website, so menus that extend over the page (a context menu
 * opened near the sidebar's edge, a submenu that opens to the right) stay visible. Mount once.
 */
export function usePopupCutouts() {
  useEffect(() => {
    // Rust keeps holes until they're cleared. A UI reload (Vite, Ctrl+R) with a popup open never
    // ran the cleanup, which left a stale hole over the page; clear every popup id on mount.
    for (const id of POPUP_IDS) sendCutout(id, null)

    const tracked = new Map<Element, { id: string; stop: () => void }>()

    const sync = () => {
      const popups = new Set(document.querySelectorAll<HTMLElement>(OPEN_POPUP_SELECTOR))
      for (const [el, { stop }] of tracked) {
        if (!popups.has(el as HTMLElement)) {
          stop()
          tracked.delete(el)
        }
      }
      for (const el of popups) {
        if (tracked.has(el)) continue
        const used = new Set([...tracked.values()].map((t) => t.id))
        const id = POPUP_IDS.find((candidate) => !used.has(candidate))
        // More than 8 popups at once: the extra ones just stay under the page.
        if (!id) continue
        // 1px for the popup's ring, drawn just outside it.
        tracked.set(el, { id, stop: trackContentCutout(id, el, 1) })
      }
    }

    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      for (const { stop } of tracked.values()) stop()
    }
  }, [])
}
