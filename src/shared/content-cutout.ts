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
/**
 * How far behind a measurement the UI's own frame reaches the screen, at least, in ms. Grows with
 * slow frames: after a launch or a restore the UI redraws the card from scratch, frames come
 * ~65ms apart, and the screen shows the card well behind where the animation clock has it.
 */
const SHOWN_LAG_MS = 3 * FRAME_MS

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
 * Where `el` is `ms` from now (negative: ago): seeks its running animations, measures, and seeks
 * them back, all in this task, so nothing is ever painted at the sampled time.
 */
function boxAt(el: Element, motion: Animation[], ms: number): Box {
  const seeked: [Animation, number][] = []
  for (const a of motion) {
    const end = a.effect?.getComputedTiming().endTime
    if (a.playState !== "running" || typeof a.currentTime !== "number" || typeof end !== "number") continue
    seeked.push([a, a.currentTime])
    // Within the animation; just short of the end, as one seeked to its end counts as finished.
    a.currentTime = Math.min(Math.max(a.currentTime + ms * a.playbackRate, 0), end - 0.01)
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
 * @param instant asked once, on the first frame: true skips the element's own animations (its fade
 *                in and out), so a popup that reaches over the page shows and hides in one piece
 *                instead of fading inside the UI while its part over the page waits to be opaque
 */
export function trackContentCutout(
  id: string,
  el: HTMLElement,
  inflate = 0,
  instant?: () => boolean,
): () => void {
  let frame = 0
  let last = ""
  let skipOwnMotion: boolean | null = instant ? null : false
  const finishOwnMotion = () => {
    for (const a of el.getAnimations()) a.finish()
  }
  // The last two frame times while moving: slow frames mean the screen is further behind.
  let frameAt: number | null = null
  let gaps = [FRAME_MS, FRAME_MS]
  const report = (time = performance.now()) => {
    frame = 0
    skipOwnMotion ??= instant?.() ?? false
    if (skipOwnMotion) finishOwnMotion()
    const motion = motionOf(el)
    const moving = motion.length > 0
    if (frameAt !== null) gaps = [gaps[1], time - frameAt]
    // First frame of a motion: nothing of it is on screen yet, so hold the hole where it started.
    const shownLag = frameAt === null ? Infinity : Math.max(SHOWN_LAG_MS, 2 * Math.max(...gaps))
    frameAt = moving ? time : null
    if (!moving) gaps = [FRAME_MS, FRAME_MS]
    // The screen shows the UI a few frames behind this measurement, and the hole lands `lagMs`
    // after it: cut only what the element covers over that whole span (halfway points too, for
    // motion that turns back, like a spring's overshoot).
    const box = moving
      ? [-shownLag, -Math.min(shownLag, SHOWN_LAG_MS) / 2, lagMs / 2, lagMs].reduce(
          (hole, ms) => intersect(hole, boxAt(el, motion, ms)),
          boxOf(el),
        )
      : boxOf(el)
    const rect: [number, number, number, number] | null =
      isOpaque(el) && box.right > box.left && box.bottom > box.top
        ? [box.left - inflate, box.top - inflate, box.right - box.left + inflate * 2, box.bottom - box.top + inflate * 2]
        : null
    // At most half the hole's shorter side, as CSS draws it: `rounded-full` computes to an endless
    // radius, and a hole with corners bigger than itself was cut as an ellipse, not a pill.
    const css = (parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0) + inflate
    const radius = rect ? Math.min(css, rect[2] / 2, rect[3] / 2) : 0
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
    if (!(event.target instanceof Node && event.target.contains(el))) return
    // Closing starts a fade-out too: skip it the same way (the popup unmounts right away).
    if (skipOwnMotion && event.target === el) finishOwnMotion()
    schedule()
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

/**
 * True when part of `el` lies over the page and outside the sidebar card (which, peeking, covers
 * the page with its own hole). That part shows only through a hole, which can't fade.
 */
export function reachesOverPage(el: Element) {
  const page = document.querySelector('[data-slot="content-slot"]')?.getBoundingClientRect()
  if (!page) return false
  const r = el.getBoundingClientRect()
  const overPage = r.left < page.right && r.right > page.left && r.top < page.bottom && r.bottom > page.top
  const card = document.querySelector('[data-slot="sidebar-inner"]')?.getBoundingClientRect()
  const inCard = card && r.left >= card.left && r.right <= card.right && r.top >= card.top && r.bottom <= card.bottom
  return overPage && !inCard
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
        // Drawn over the page's picture, not the page (shared/page-cover): nothing to cut.
        if (tracked.has(el) || el.closest("[data-over-cover]")) continue
        const used = new Set([...tracked.values()].map((t) => t.id))
        const id = POPUP_IDS.find((candidate) => !used.has(candidate))
        // More than 8 popups at once: the extra ones just stay under the page.
        if (!id) continue
        // 1px for the popup's ring, drawn just outside it.
        tracked.set(el, { id, stop: trackContentCutout(id, el, 1, () => reachesOverPage(el)) })
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
