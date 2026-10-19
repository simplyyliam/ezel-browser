import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window"

// Tauri's window APIs (not backend commands, so not in shared/tauri.ts).

export const minimizeWindow = () => getCurrentWindow().minimize()
export const toggleMaximizeWindow = () => getCurrentWindow().toggleMaximize()
export const closeWindow = () => getCurrentWindow().close()

/** Cursor position in physical px, desktop coordinates. Works while the cursor is outside the window. */
export const getCursorPosition = () => cursorPosition()

/** The window's client area in physical px, desktop coordinates, plus its scale factor. */
export async function getWindowClientRect() {
  const window = getCurrentWindow()
  const [position, size, scale] = await Promise.all([
    window.innerPosition(),
    window.innerSize(),
    window.scaleFactor(),
  ])
  return { x: position.x, y: position.y, width: size.width, height: size.height, scale }
}
