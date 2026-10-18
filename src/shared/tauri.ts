import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window"
import type { PageChanged } from "./page"

export const getPage = () => invoke<PageChanged>("get_page")
export const navigate = (input: string) => invoke<void>("navigate", { input })
export const goBack = () => invoke<void>("go_back")
export const goForward = () => invoke<void>("go_forward")
export const reload = () => invoke<void>("reload")

/** Places the content webview; logical px relative to the window's top-left. */
export const setContentBounds = (x: number, y: number, width: number, height: number) =>
  invoke<void>("set_content_bounds", { x, y, width, height })
/** Rounds the content webview's corners; logical px in CSS order (top-left, top-right, bottom-right, bottom-left). */
export const setContentRadius = (radii: [number, number, number, number]) =>
  invoke<void>("set_content_radius", { radii })
/** Cuts a window-relative rounded rect (logical px) out of the content webview under `id`; `rect: null` clears that hole. */
export const setContentCutout = (id: string, rect: [number, number, number, number] | null, radius = 0) =>
  invoke<void>("set_content_cutout", { id, rect, radius })
export const setContentVisible = (visible: boolean) => invoke<void>("set_content_visible", { visible })

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

/** OS window corner radius in logical px; `radius: null` = unknown (not Windows). */
export type WindowRadius = { radius: number | null; customized: boolean }
export const getWindowRadius = () => invoke<WindowRadius>("get_window_radius")

export function onWindowRadiusChanged(handler: (radius: WindowRadius) => void): Promise<UnlistenFn> {
  return listen<WindowRadius>("window-radius-changed", (event) => handler(event.payload))
}

/** Ctrl+B pressed while the website has focus (Rust forwards it; the ui webview never sees those keys). */
export function onToggleSidebar(handler: () => void): Promise<UnlistenFn> {
  return listen("toggle-sidebar", () => handler())
}

export function onPageChanged(handler: (page: PageChanged) => void): Promise<UnlistenFn> {
  return listen<PageChanged>("page-changed", (event) => handler(event.payload))
}
