import { useEffect, useRef } from "react"
import { OPEN_POPUP_SELECTOR } from "./outside-press"
import { commands } from "./bindings"

type Hole = { rect: [number, number, number, number] | null; radius: number; at: number }

const FRAME_MS = 1000 / 60
/**
 * How long a hole takes to land after it's measured (the call's round trip plus a frame for the
 * compositor), in ms. Jumps up to slow calls (an app still starting), then eases back down.
 */
let lagMs = 3 * FRAME_MS

// One call per hole id at a time: a later call (the final clear) can never overtake an earlier
// one, even when a popup id is reused right away. Only the newest hole waits behind the call in
// flight, so slow calls never build a backlog that leaves the hole further and further behind.
const waiting = new Map<string, Hole>()
const sending = new Set<string>()
function sendCutout(id: string, rect: [number, number, number, number] | null, radius = 0) {
  waiting.set(id, { rect, radius, at: performance.now() })
  if (!sending.has(id)) void send(id)
}
async function send(id: string) {
  sending.add(id)
  for (let hole = waiting.get(id); hole; hole = waiting.get(id)) {
    waiting.delete(id)
    await commands.setContentCutout(id, hole.rect, hole.radius).catch(() => {})
    const took = performance.now() - hole.at + FRAME_MS
    lagMs = Math.min(Math.max(took, lagMs * 0.9, FRAME_MS), 250)
  }
  sending.delete(id)
}

/** The CSS transitions/animations running on `el` or an ancestor (which would move or resize it). */
const motionOf = (el: Element) =>
  document.getAnimations().filter((a) => {
    const target = (a.effect as KeyframeEffect | null)?.target
    return target instanceof Element && target.contains(el)
  })

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
}

/**
 * Where `el` will be `ms` from now: seeks its running animations ahead, measures, and seeks them
 * back, all in this task, so nothing is ever painted at the sampled time.
 */
function boxAhead(el: Element, motion: Animation[], ms: number): Box {
  const seeked: [Animation, number][] = []
  for (const a of motion) {
    const end = a.effect?.getComputedTiming().endTime
    if (a.playState !== "running" || typeof a.currentTime !== "number" || typeof end !== "number") continue
    seeked.push([a, a.currentTime])
    // Just short of the end: an animation seeked to its end counts as finished.
    a.currentTime = Math.min(a.currentTime + ms * a.playbackRate, end - 0.01)
  }
  const box = boxOf(el)
  for (const [a, time] of seeked) a.currentTime = time
  return box
}

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
 * opaque), and while it moves only the part it covers from now until the hole lands (a call's
 * round trip later; a hole at its current rect would trail behind it like a ghost).
 *
 * @param id      one hole per id ("titlebar", "sidebar", ...)
 * @param inflate grow the hole by this many px, e.g. to include a 1px ring drawn outside the element
 */
export function trackContentCutout(id: string, el: HTMLElement, inflate = 0): () => void {
  let frame = 0
  let last = ""
  const report = () => {
    frame = 0
    const motion = motionOf(el)
    const moving = motion.length > 0
    // Halfway too, for motion that turns back (a spring's overshoot).
    const box = moving
      ? intersect(intersect(boxOf(el), boxAhead(el, motion, lagMs / 2)), boxAhead(el, motion, lagMs))
      : boxOf(el)
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
