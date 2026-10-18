import { useEffect } from "react"

/** Popups portaled out of #root by shadcn/Base UI (menus, submenus, popovers...). Inside #root,
 *  "-content" slots are layout (e.g. sidebar-content). */
export const OPEN_POPUP_SELECTOR = 'body > :not(#root) [data-slot$="-content"]'

export const isPopupOpen = () => document.querySelector(OPEN_POPUP_SELECTOR) !== null

/**
 * Closes every open popup as if the user pressed outside it: Base UI's dismiss listens for these
 * events on the document (useDismiss: pointerdown/mousedown, then click) and closes when the target
 * is outside its own elements.
 */
export function dismissPopups() {
  if (!isPopupOpen()) return
  const target = document.body
  const init = { bubbles: true, cancelable: true, composed: true, button: 0 }
  target.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerType: "mouse", isPrimary: true }))
  target.dispatchEvent(new MouseEvent("mousedown", init))
  target.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerType: "mouse", isPrimary: true }))
  target.dispatchEvent(new MouseEvent("mouseup", init))
  target.dispatchEvent(new MouseEvent("click", init))
}

/**
 * Clicks on the website land in its own native webview, so popups never see them as outside presses
 * and stay open. Clicking there takes focus from the UI webview, so treat the UI losing focus
 * (website clicked, or another app activated) as an outside press, like native menus that close
 * when their window deactivates. Mount once.
 */
export function useDismissPopupsOnBlur() {
  useEffect(() => {
    const onBlur = () => dismissPopups()
    window.addEventListener("blur", onBlur)
    return () => window.removeEventListener("blur", onBlur)
  }, [])
}
