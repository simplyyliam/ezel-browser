import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
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
export const setContentVisible = (visible: boolean) => invoke<void>("set_content_visible", { visible })

export const minimizeWindow = () => getCurrentWindow().minimize()
export const toggleMaximizeWindow = () => getCurrentWindow().toggleMaximize()
export const closeWindow = () => getCurrentWindow().close()

/** OS window corner radius in logical px; `radius: null` = unknown (not Windows). */
export type WindowRadius = { radius: number | null; customized: boolean }
export const getWindowRadius = () => invoke<WindowRadius>("get_window_radius")

export function onWindowRadiusChanged(handler: (radius: WindowRadius) => void): Promise<UnlistenFn> {
  return listen<WindowRadius>("window-radius-changed", (event) => handler(event.payload))
}

export function onPageChanged(handler: (page: PageChanged) => void): Promise<UnlistenFn> {
  return listen<PageChanged>("page-changed", (event) => handler(event.payload))
}
