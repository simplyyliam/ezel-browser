import { useRef, type WheelEvent } from "react"
import type { Id, Space } from "@/shared"
import { unwrap } from "@/shared"
import { commands } from "@/shared/bindings"

/** Sideways travel (px of wheel delta) that switches a space: a deliberate swipe, not a drift. */
const SWIPE_DISTANCE = 90
/** A gesture ends after this long without wheel events; only then can it switch again. */
const GESTURE_END_MS = 220

/**
 * Two-finger swipe sideways over the sidebar switches to the next or previous space (trackpads
 * send it as a horizontal wheel; Shift+wheel too). One switch per gesture, so a long swipe never
 * skips spaces; the footer's pill follows (it glides). Mostly-vertical scrolling is left
 * alone. Returns the `onWheel` for the sidebar's body. No timers while idle: the one timeout runs
 * only during a gesture.
 */
export function useSpaceSwipe(spaces: Space[] | undefined, activeSpaceId: Id | undefined) {
  const travel = useRef(0)
  const switched = useRef(false)
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  return (event: WheelEvent) => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
    clearTimeout(idle.current)
    idle.current = setTimeout(() => {
      travel.current = 0
      switched.current = false
    }, GESTURE_END_MS)
    if (switched.current || !spaces || spaces.length < 2) return
    travel.current += event.deltaX
    if (Math.abs(travel.current) < SWIPE_DISTANCE) return
    switched.current = true
    const index = spaces.findIndex((s) => s.id === activeSpaceId)
    // Fingers moving left reveal what's to the right: the next space (as pages do).
    const next = spaces[index + (travel.current > 0 ? 1 : -1)]
    if (next) unwrap("switch space", commands.switchSpace(next.id))
  }
}
