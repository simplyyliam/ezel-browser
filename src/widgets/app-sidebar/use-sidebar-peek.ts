import { useEffect, useRef, useState } from "react"
import { getCursorPosition, getWindowClientRect } from "@/shared"

// Port of Zen's compact-mode sidebar hover (src/zen/compact-mode/ZenCompactMode.mjs, prefs/zen/compact-mode.yaml).

/** Zen: zen.view.compact.sidebar-keep-hover.duration. Covers the gap between the edge strip and the card. */
const KEEP_HOVER = 150
/** Zen: zen.view.compact.outside-window-edge-offset.horizontal. How far left of the window the pointer may go. */
const OUTSIDE_LEFT_OFFSET = 200
/** Zen: zen.view.compact.toolbar-hide-after-hover.duration. Fallback when the cursor can't be read outside the window. */
const HIDE_AFTER_EXIT = 1000
/** A pointer leaving the document this close to the left edge counts as leaving the window. Zen: _getCrossedEdge. */
const EDGE_TOLERANCE = 10

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))
const popupOpen = () => document.querySelector('[data-slot="dropdown-menu-content"]') !== null

/**
 * While `enabled` (the sidebar is collapsed), hovering the window's left edge peeks the sidebar out
 * over the page. It stays while hovered, while it holds focus or an open menu, and briefly after the
 * pointer leaves; leaving through the window's left edge keeps it open while the pointer stays close.
 */
export function useSidebarPeek(enabled: boolean) {
  const [peeking, setPeeking] = useState(false)
  const edgeRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const edge = edgeRef.current
    const sidebar = sidebarRef.current
    if (!enabled || !edge || !sidebar) {
      setPeeking(false)
      return
    }

    let closeTimer: ReturnType<typeof setTimeout> | undefined
    let tracking = false
    let fallback: ReturnType<typeof setTimeout> | undefined

    const stopTracking = () => {
      tracking = false
      clearTimeout(fallback)
    }

    /** Hovered, focused (e.g. typing in the URL bar) or showing a menu. */
    const held = () =>
      edge.matches(":hover") ||
      sidebar.matches(":hover") ||
      sidebar.contains(document.activeElement) ||
      popupOpen()

    const scheduleClose = (delay: number) => {
      clearTimeout(closeTimer)
      closeTimer = setTimeout(() => {
        if (!tracking && !held()) setPeeking(false)
      }, delay)
    }

    const open = () => {
      clearTimeout(closeTimer)
      stopTracking()
      setPeeking(true)
    }

    // Left through the window's left edge: stay open while the pointer is just outside, like Zen's mouse tracker.
    const keepOpenOutside = async () => {
      clearTimeout(closeTimer)
      if (tracking) return
      tracking = true
      try {
        const win = await getWindowClientRect()
        const maxOffset = OUTSIDE_LEFT_OFFSET * win.scale
        while (tracking) {
          const { x, y } = await getCursorPosition()
          if (!tracking) return
          const withinY = y >= win.y && y <= win.y + win.height
          if (withinY && x >= win.x && x <= win.x + win.width) {
            // Back inside: the hover listeners take over.
            stopTracking()
            scheduleClose(KEEP_HOVER)
            return
          }
          if (!withinY || x < win.x - maxOffset || x > win.x) {
            stopTracking()
            setPeeking(false)
            return
          }
          await nextFrame()
        }
      } catch {
        if (tracking) fallback = setTimeout(() => {
          stopTracking()
          if (!held()) setPeeking(false)
        }, HIDE_AFTER_EXIT)
      }
    }

    const onLeave = (event: MouseEvent) => {
      if (event.relatedTarget === null && event.clientX <= EDGE_TOLERANCE) {
        keepOpenOutside()
        return
      }
      scheduleClose(KEEP_HOVER)
    }
    const onFocusOut = () => scheduleClose(KEEP_HOVER)
    // A menu closing (its portal leaves the DOM) may be the last thing holding the sidebar open.
    const popups = new MutationObserver(() => scheduleClose(KEEP_HOVER))
    popups.observe(document.body, { childList: true })

    edge.addEventListener("mouseover", open)
    sidebar.addEventListener("mouseover", open)
    edge.addEventListener("mouseleave", onLeave)
    sidebar.addEventListener("mouseleave", onLeave)
    sidebar.addEventListener("focusout", onFocusOut)
    return () => {
      clearTimeout(closeTimer)
      stopTracking()
      popups.disconnect()
      edge.removeEventListener("mouseover", open)
      sidebar.removeEventListener("mouseover", open)
      edge.removeEventListener("mouseleave", onLeave)
      sidebar.removeEventListener("mouseleave", onLeave)
      sidebar.removeEventListener("focusout", onFocusOut)
    }
  }, [enabled])

  return { peeking: enabled && peeking, edgeRef, sidebarRef }
}
