import { useEffect, useRef, useState } from "react"
import { getCursorPosition, getWindowClientRect, isPopupOpen } from "@/shared"

// Port of Zen's compact-mode sidebar (src/zen/compact-mode/ZenCompactMode.mjs, prefs/zen/compact-mode.yaml)
// and its popup tracking (src/zen/common/modules/ZenUIManager.mjs, `has-popup-menu`).

/** Zen: zen.view.compact.sidebar-keep-hover.duration. Covers the gap between the edge strip and the card. */
const KEEP_HOVER = 150
/** Zen: zen.view.compact.outside-window-edge-offset.horizontal. How far left of the window the pointer may go. */
const OUTSIDE_LEFT_OFFSET = 200
/** Zen: zen.view.compact.toolbar-hide-after-hover.duration. Fallback when the cursor can't be read outside the window. */
const HIDE_AFTER_EXIT = 1000
/** A pointer leaving the document this close to the left edge counts as leaving the window. Zen: _getCrossedEdge. */
const EDGE_TOLERANCE = 10

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

/**
 * While `enabled` (the sidebar is collapsed), hovering the window's left edge peeks the sidebar out
 * over the page. What keeps it out:
 * - hover, with a short grace period after the pointer leaves (and while the pointer is just outside
 *   the window's left edge);
 * - a popup opened from inside it (context menu, dropdown), regardless of hover or focus, until the
 *   popup closes. Like Zen's `has-popup-menu`;
 * - typing in one of its fields (the URL bar), while the window has focus.
 * A click on the page closes open popups (see useDismissPopupsOnBlur), and then the sidebar.
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
    /** A popup opened from inside the sidebar is showing. */
    let popupHeld = false
    /** The last press (left or right click) landed inside the sidebar. */
    let pressedInside = false

    const stopTracking = () => {
      tracking = false
      clearTimeout(fallback)
    }

    const typingInside = () => {
      const active = document.activeElement
      return (
        document.hasFocus() &&
        active instanceof HTMLElement &&
        sidebar.contains(active) &&
        active.matches("input, textarea, [contenteditable]:not([contenteditable=false])")
      )
    }

    const held = () => popupHeld || edge.matches(":hover") || sidebar.matches(":hover") || typingInside()

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
            if (!popupHeld) setPeeking(false)
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

    // Zen sets `has-popup-menu` on popupshowing when the popup's trigger is inside the sidebar.
    // Popups here open from a press (right-click, click), so remember where the last press was.
    const onPress = (event: Event) => {
      if (event.isTrusted) pressedInside = event.target instanceof Node && sidebar.contains(event.target)
    }
    const popups = new MutationObserver(() => {
      const open = isPopupOpen()
      if (open && !popupHeld && pressedInside) {
        popupHeld = true
        clearTimeout(closeTimer)
      } else if (!open && popupHeld) {
        // Closed by a click inside the sidebar: still hovered, stays. Closed by a click on the
        // page (or Escape with the pointer away): nothing holds it any more, so it slides away.
        popupHeld = false
        scheduleClose(KEEP_HOVER)
      }
    })
    popups.observe(document.body, { childList: true, subtree: true })

    document.addEventListener("pointerdown", onPress, true)
    document.addEventListener("contextmenu", onPress, true)
    edge.addEventListener("mouseover", open)
    sidebar.addEventListener("mouseover", open)
    edge.addEventListener("mouseleave", onLeave)
    sidebar.addEventListener("mouseleave", onLeave)
    sidebar.addEventListener("focusout", onFocusOut)
    window.addEventListener("blur", onFocusOut)
    return () => {
      clearTimeout(closeTimer)
      stopTracking()
      popups.disconnect()
      document.removeEventListener("pointerdown", onPress, true)
      document.removeEventListener("contextmenu", onPress, true)
      edge.removeEventListener("mouseover", open)
      sidebar.removeEventListener("mouseover", open)
      edge.removeEventListener("mouseleave", onLeave)
      sidebar.removeEventListener("mouseleave", onLeave)
      sidebar.removeEventListener("focusout", onFocusOut)
      window.removeEventListener("blur", onFocusOut)
    }
  }, [enabled])

  return { peeking: enabled && peeking, edgeRef, sidebarRef }
}
