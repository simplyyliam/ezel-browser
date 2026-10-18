import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import type { PageChanged } from "./page"

export const getPage = () => invoke<PageChanged>("get_page")
export const navigate = (input: string) => invoke<void>("navigate", { input })
export const goBack = () => invoke<void>("go_back")
export const goForward = () => invoke<void>("go_forward")
export const reload = () => invoke<void>("reload")

export function onPageChanged(handler: (page: PageChanged) => void): Promise<UnlistenFn> {
  return listen<PageChanged>("page-changed", (event) => handler(event.payload))
}
