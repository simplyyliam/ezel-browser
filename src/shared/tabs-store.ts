import { useSyncExternalStore } from "react"
import { getTabs, onTabsChanged, onTabUpdated } from "./tauri"
import type { Folder, Space, SpaceItem, Tab, TabsState } from "./types"

// A read-only mirror of Rust's tab state: `get_tabs` once, then `tabs-changed` (whole state) and
// `tab-updated` (one tab). The UI never edits it; actions are commands, and the backend's event
// brings the result back. Nothing here can drift from the backend.

let state: TabsState | null = null
const subscribers = new Set<() => void>()
let stopListening: (() => void) | null = null

function set(next: TabsState) {
  state = next
  subscribers.forEach((notify) => notify())
}

function patchTab(tab: Tab) {
  if (!state) return
  const swap = (t: Tab) => (t.id === tab.id ? tab : t)
  const item = (i: SpaceItem): SpaceItem =>
    i.kind === "tab"
      ? { kind: "tab", tab: swap(i.tab) }
      : { kind: "folder", folder: { ...i.folder, tabs: i.folder.tabs.map(swap) } satisfies Folder }
  set({
    ...state,
    swatches: state.swatches.map((s) => s && swap(s)),
    spaces: state.spaces.map((space): Space => ({
      ...space,
      items: space.items.map(item),
      tempTabs: space.tempTabs.map(swap),
    })),
  })
}

function start() {
  // Subscribe before fetching the snapshot so no change slips through in between;
  // a `tabs-changed` that arrives first is newer than the snapshot, so it wins.
  let gotState = false
  const unlisteners = [
    onTabsChanged((next) => {
      gotState = true
      set(next)
    }),
    onTabUpdated(patchTab),
  ]
  getTabs().then((snapshot) => {
    if (!gotState) set(snapshot)
  })
  return () => unlisteners.forEach((unlisten) => unlisten.then((fn) => fn()))
}

function subscribe(notify: () => void) {
  subscribers.add(notify)
  stopListening ??= start()
  return () => {
    subscribers.delete(notify)
    if (subscribers.size === 0) {
      stopListening?.()
      stopListening = null
      state = null
    }
  }
}

/** The backend's tab state; null until the first snapshot arrives. */
export function useTabs(): TabsState | null {
  return useSyncExternalStore(subscribe, () => state)
}

/** The active space, from a `useTabs()` state. */
export function activeSpace(tabs: TabsState): Space | undefined {
  return tabs.spaces.find((space) => space.id === tabs.activeSpaceId)
}
