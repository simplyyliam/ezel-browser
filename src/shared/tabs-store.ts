import { useSyncExternalStore } from "react"
import { commands, events } from "./bindings"
import { unwrap } from "./report-error"
import type { Folder, Id, Space, SpaceItem, Tab, TabsState } from "./types"

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

/** Same fields, so the same row: a tab from a new `tabs-changed` that didn't change. */
function sameTab(a: Tab, b: Tab) {
  return (
    a.id === b.id &&
    a.url === b.url &&
    a.title === b.title &&
    a.favicon === b.favicon &&
    a.pinnedUrl === b.pinnedUrl &&
    a.isLoaded === b.isLoaded &&
    a.isLoading === b.isLoading &&
    a.isPlayingAudio === b.isPlayingAudio &&
    a.isMuted === b.isMuted &&
    a.isDev === b.isDev &&
    a.layers.length === b.layers.length &&
    a.layers.every((layer, i) => layer === b.layers[i])
  )
}

/**
 * `next` with every unchanged tab replaced by the object already on screen. Each `tabs-changed`
 * carries the whole state, freshly parsed; keeping the old objects lets memoised rows skip
 * re-rendering, so one tab's change redraws one row, not all of them (docs/perf/many-tabs.md).
 */
function reuseTabs(prev: TabsState | null, next: TabsState): TabsState {
  if (!prev) return next
  const old = new Map<number, Tab>()
  const collect = (tab: Tab | null) => tab && old.set(tab.id, tab)
  prev.swatches.forEach(collect)
  for (const space of prev.spaces) {
    space.items.forEach((item) => (item.kind === "tab" ? collect(item.tab) : item.folder.tabs.forEach(collect)))
    space.tempTabs.forEach(collect)
  }
  const keep = (tab: Tab) => {
    const before = old.get(tab.id)
    return before && sameTab(before, tab) ? before : tab
  }
  return {
    ...next,
    swatches: next.swatches.map((tab) => tab && keep(tab)),
    spaces: next.spaces.map((space) => ({
      ...space,
      items: space.items.map((item): SpaceItem =>
        item.kind === "tab" ? { kind: "tab", tab: keep(item.tab) } : { kind: "folder", folder: { ...item.folder, tabs: item.folder.tabs.map(keep) } },
      ),
      tempTabs: space.tempTabs.map(keep),
    })),
  }
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
    events.tabsChanged.listen((event) => {
      gotState = true
      set(reuseTabs(state, event.payload))
    }),
    events.tabUpdated.listen((event) => patchTab(event.payload)),
  ]
  unwrap("get tabs", commands.getTabs()).then((snapshot) => {
    if (snapshot && !gotState) set(snapshot)
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

/**
 * Whether a tab is still anywhere in the latest state (a space, a folder, the Swatches). A row
 * leaving its list asks this: a tab that's gone was closed (its row collapses), one still here
 * was moved (its row leaves at once; the new place shows it).
 */
export function isTabOpen(id: Id): boolean {
  if (!state) return false
  if (state.swatches.some((tab) => tab?.id === id)) return true
  return state.spaces.some(
    (space) =>
      space.tempTabs.some((tab) => tab.id === id) ||
      space.items.some((item) => (item.kind === "tab" ? item.tab.id === id : item.folder.tabs.some((tab) => tab.id === id))),
  )
}
