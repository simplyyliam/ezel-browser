// Data the backend sends or receives; see CLAUDE.md, "Contract". Commands and events are in `shared/tauri.ts`.

/** The shown tab's page: `get_page` and the `page-changed` event. */
export type PageChanged = {
  url: string
  title: string | null
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
}

/** OS window corner radius in logical px (`get_window_radius` / `window-radius-changed`); `radius: null` = unknown (not Windows). */
export type WindowRadius = { radius: number | null; customized: boolean }

/** Tab, folder and space ids: numbers from one shared counter, never reused. */
export type Id = number

/** One tab (`TabView` in Rust). */
export type Tab = {
  id: Id
  url: string
  title: string | null
  /** Favicon URL; null shows the grey-circle placeholder. */
  favicon: string | null
  /** Pinned and swatch tabs: the URL closing/resetting returns to. Null for temp tabs. */
  pinnedUrl: string | null
  /** Has a webview. Unloaded tabs show dimmed and load when selected. */
  isLoaded: boolean
  isLoading: boolean
  isPlayingAudio: boolean
}

export type Folder = {
  id: Id
  name: string
  collapsed: boolean
  tabs: Tab[]
}

/** A space's pinned list mixes folders and standalone tabs. */
export type SpaceItem = { kind: "folder"; folder: Folder } | { kind: "tab"; tab: Tab }

export type Space = {
  id: Id
  name: string
  /** A lucide icon name (kebab-case); `spaceIcon()` in `shared/space-icons` maps it to a component. */
  icon: string
  items: SpaceItem[]
  /** Unpinned tabs, newest first. */
  tempTabs: Tab[]
}

/** One cell of the Swatches grid (always 8, shared by every space); null = empty cell. */
export type Swatch = Tab | null

/** Payload of `get_tabs` and the `tabs-changed` event. */
export type TabsState = {
  activeSpaceId: Id
  activeTabId: Id | null
  swatches: Swatch[]
  spaces: Space[]
}

/** Where `move_tab` puts a tab. `index: null` = end of pinned / top of temp. */
export type TabLocation =
  | { kind: "swatch"; slot: number }
  | { kind: "pinned"; spaceId: Id; folderId: Id | null; index: number | null }
  | { kind: "temp"; spaceId: Id; index: number | null }
