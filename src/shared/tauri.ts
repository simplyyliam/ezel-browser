import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import type { Id, PageChanged, Tab, TabLocation, TabsState, WindowRadius } from "./types"

// Backend bindings: one typed wrapper per command (named after it, camelCase) and one typed listener
// per event. Keep it thin, no logic: it will be replaced by a generated bindings file. Data types
// live in shared/types; window APIs in shared/window.ts.

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

export const getWindowRadius = () => invoke<WindowRadius>("get_window_radius")

export function onWindowRadiusChanged(handler: (radius: WindowRadius) => void): Promise<UnlistenFn> {
  return listen<WindowRadius>("window-radius-changed", (event) => handler(event.payload))
}

/** Ctrl+B pressed while the website has focus. Legacy: replaced by "hotkey-pressed" (id "toggleSidebar"). */
export function onToggleSidebar(handler: () => void): Promise<UnlistenFn> {
  return listen("toggle-sidebar", () => handler())
}

/** A shortcut Rust catches in the tab webviews (they never pass keys to the UI). See shared/hotkeys.ts. */
export type ForwardedHotkey = { id: string; key: string; ctrl: boolean; shift: boolean; alt: boolean; focusUi: boolean }

// Not in the generated bindings until the backend has `set_forwarded_hotkeys` / "hotkey-pressed";
// then switch shared/hotkeys.ts to commands.setForwardedHotkeys / events.hotkeyPressed and delete these.
/** Replaces the list of shortcuts caught while the website has focus. */
export const setForwardedHotkeys = (hotkeys: ForwardedHotkey[]) => invoke<void>("set_forwarded_hotkeys", { hotkeys })
/** A forwarded shortcut was pressed in the website; `id` as sent in `set_forwarded_hotkeys`. */
export function onHotkeyPressed(handler: (id: string) => void): Promise<UnlistenFn> {
  return listen<{ id: string }>("hotkey-pressed", (event) => handler(event.payload.id))
}

export function onPageChanged(handler: (page: PageChanged) => void): Promise<UnlistenFn> {
  return listen<PageChanged>("page-changed", (event) => handler(event.payload))
}

// Tabs, folders, spaces. Every change also emits "tabs-changed"; components read state through `useTabs` (shared/tabs-store).

export const getTabs = () => invoke<TabsState>("get_tabs")
/** New temp tab on top of the active space, selected; the home page without input. Resolves to its id. */
export const openTab = (input?: string) => invoke<Id>("open_tab", { input })
export const activateTab = (id: Id) => invoke<void>("activate_tab", { id })
/** A temp tab is removed; a pinned/swatch tab is unloaded and reset to its pinned URL. */
export const closeTab = (id: Id) => invoke<void>("close_tab", { id })
export const removeTab = (id: Id) => invoke<void>("remove_tab", { id })
export const unloadTab = (id: Id) => invoke<void>("unload_tab", { id })
export const moveTab = (id: Id, to: TabLocation) => invoke<void>("move_tab", { id, to })
export const resetTab = (id: Id) => invoke<void>("reset_tab", { id })
export const updatePinnedUrl = (id: Id) => invoke<void>("update_pinned_url", { id })
/** Trash-all: closes the space's temp tabs only. */
export const clearTempTabs = (spaceId: Id) => invoke<void>("clear_temp_tabs", { spaceId })

export const createFolder = (spaceId: Id, name: string, index?: number) =>
  invoke<Id>("create_folder", { spaceId, name, index })
export const renameFolder = (id: Id, name: string) => invoke<void>("rename_folder", { id, name })
export const setFolderCollapsed = (id: Id, collapsed: boolean) => invoke<void>("set_folder_collapsed", { id, collapsed })
export const moveFolder = (id: Id, spaceId: Id, index?: number) =>
  invoke<void>("move_folder", { id, spaceId, index })
/** `keepTabs`: unpack the folder's tabs into the space instead of removing them. */
export const deleteFolder = (id: Id, keepTabs: boolean) => invoke<void>("delete_folder", { id, keepTabs })
export const unloadFolder = (id: Id) => invoke<void>("unload_folder", { id })

/** `icon` is a lucide icon name. Resolves to the new space's id. */
export const createSpace = (name: string, icon: string) => invoke<Id>("create_space", { name, icon })
/** Omitted fields are left unchanged. */
export const updateSpace = (id: Id, name?: string, icon?: string) =>
  invoke<void>("update_space", { id, name, icon })
export const moveSpace = (id: Id, index: number) => invoke<void>("move_space", { id, index })
/** Fails for the last space. */
export const deleteSpace = (id: Id) => invoke<void>("delete_space", { id })
/** Shows the tab the space showed last. */
export const switchSpace = (id: Id) => invoke<void>("switch_space", { id })

export function onTabsChanged(handler: (state: TabsState) => void): Promise<UnlistenFn> {
  return listen<TabsState>("tabs-changed", (event) => handler(event.payload))
}

/** One tab's URL, title, favicon, loading or audio state changed (any tab, shown or not). */
export function onTabUpdated(handler: (tab: Tab) => void): Promise<UnlistenFn> {
  return listen<Tab>("tab-updated", (event) => handler(event.payload))
}
