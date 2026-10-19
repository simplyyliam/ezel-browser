import {
  activateTab,
  closeTab,
  moveTab,
  openTab,
  reload,
  unloadTab,
  type Id,
  type Space,
  type Tab,
  type TabsState,
} from "@/shared"
import type { TabMenu, TabMenuItem } from "@/shared/components"
import { hasFreeSlot, insertSwatch, swatchOrder } from "./swatch-moves"

// The tab's right-click menu. Studied from Zen's tab menu (docs/design/context-menus.md, "Tab
// menu"): only what any browser has (Firefox's own tab menu, which Zen builds on), plus Ezel's
// Swatches and address editing. Zen's own additions (folders, split view, labels, icons) are left out.

/** Where a tab lives: what its menu can offer depends on it. */
type Place =
  | { kind: "swatch" }
  | { kind: "pinned"; space: Space; index: number }
  | { kind: "folder"; space: Space }
  | { kind: "temp"; space: Space; index: number }

function locate(tabs: TabsState, tabId: Id): { tab: Tab; place: Place } | null {
  const swatch = tabs.swatches.find((s) => s?.id === tabId)
  if (swatch) return { tab: swatch, place: { kind: "swatch" } }
  for (const space of tabs.spaces) {
    const temp = space.tempTabs.findIndex((tab) => tab.id === tabId)
    if (temp >= 0) return { tab: space.tempTabs[temp], place: { kind: "temp", space, index: temp } }
    for (const [index, item] of space.items.entries()) {
      if (item.kind === "tab" && item.tab.id === tabId) return { tab: item.tab, place: { kind: "pinned", space, index } }
      const inFolder = item.kind === "folder" ? item.folder.tabs.find((tab) => tab.id === tabId) : undefined
      if (inFolder) return { tab: inFolder, place: { kind: "folder", space } }
    }
  }
  return null
}

/** A tab by id, wherever it is. */
export const findTab = (tabs: TabsState, tabId: Id) => locate(tabs, tabId)?.tab ?? null

const SWATCH_SLOTS = 8

type TabMenuContext = {
  tabs: TabsState
  activeSpaceId: Id
  /** Shows the tab and turns its name into the address field. */
  onEdit: (tabId: Id) => void
  /** After a new tab is open: its name field, empty, ready to type. */
  onOpened: (tabId: Id) => void
}

/** Logs a failed command; the menu has already closed, and the state is the backend's anyway. */
const run = (action: () => Promise<unknown>) => () => {
  action().catch((error) => console.error("tab menu:", error))
}

export function tabMenu(tabId: Id, { tabs, activeSpaceId, onEdit, onOpened }: TabMenuContext): TabMenu {
  const found = locate(tabs, tabId)
  if (!found) return []
  const { tab, place } = found
  const temp = place.kind === "temp" ? place : null
  const swatchCount = swatchOrder(tabs.swatches).length

  /** A new temp tab right below a temp tab; otherwise on top of the temp tabs, the first place below. */
  const openBelow = async (input?: string) => {
    const id = await openTab(input)
    if (temp) await moveTab(id, { kind: "temp", spaceId: temp.space.id, index: temp.index + 1 })
    return id
  }

  const open: TabMenuItem[] = [
    { label: "New Tab Below", onSelect: run(async () => onOpened(await openBelow())) },
    { label: "Duplicate Tab", onSelect: run(() => openBelow(tab.url)) },
  ]

  const page: TabMenuItem[] = [
    // `reload` acts on the shown tab only.
    ...(tab.id === tabs.activeTabId && tab.isLoaded ? [{ label: "Reload Tab", onSelect: run(reload) }] : []),
    { label: "Copy Link", onSelect: run(() => navigator.clipboard.writeText(tab.url)) },
  ]

  const keep: TabMenuItem[] = [
    // The name field lives in list rows; swatches have no room for it.
    ...(place.kind !== "swatch" ? [{ label: "Change URL…", onSelect: () => onEdit(tab.id) }] : []),
    place.kind === "swatch"
      ? {
          label: "Remove from Swatches",
          onSelect: run(() => moveTab(tab.id, { kind: "temp", spaceId: activeSpaceId, index: null })),
        }
      : {
          label: "Add to Swatches",
          hint: `${swatchCount} / ${SWATCH_SLOTS}`,
          disabled: !hasFreeSlot(tabs.swatches),
          // After the last swatch: a list to the user, though the backend has slots.
          onSelect: run(() => insertSwatch(tab.id, swatchCount, tabs.swatches)),
        },
    ...(temp
      ? [
          {
            label: "Pin Tab",
            onSelect: run(() => moveTab(tab.id, { kind: "pinned", spaceId: temp.space.id, folderId: null, index: null })),
          },
        ]
      : place.kind === "pinned" || place.kind === "folder"
        ? [
            {
              label: "Unpin Tab",
              onSelect: run(() => moveTab(tab.id, { kind: "temp", spaceId: place.space.id, index: null })),
            },
          ]
        : []),
  ]

  const arrange: TabMenuItem[] = [
    ...(tab.isLoaded ? [{ label: "Unload Tab", onSelect: run(() => unloadTab(tab.id)) }] : []),
    ...(place.kind === "temp" || place.kind === "pinned" ? [moveWithin(tab, place)] : []),
  ]

  const close: TabMenuItem[] = [
    { label: "Close Tab", onSelect: run(() => closeTab(tab.id)) },
    ...(temp ? [closeMultiple(tab, temp.space, temp.index)] : []),
  ]

  return [open, page, keep, arrange, close]
}

/** Move Tab ▸ to the start or end of its own list (Firefox's "Move Tab"). */
function moveWithin(tab: Tab, place: Extract<Place, { kind: "temp" | "pinned" }>): TabMenuItem {
  const count = place.kind === "temp" ? place.space.tempTabs.length : place.space.items.length
  const to = (index: number) =>
    run(() =>
      moveTab(
        tab.id,
        place.kind === "temp"
          ? { kind: "temp", spaceId: place.space.id, index }
          : { kind: "pinned", spaceId: place.space.id, folderId: null, index },
      ),
    )
  return {
    label: "Move Tab",
    items: [
      { label: "Move to Start", disabled: place.index === 0, onSelect: to(0) },
      // `move_tab` takes the tab out first: the last index is then count - 1.
      { label: "Move to End", disabled: place.index === count - 1, onSelect: to(count - 1) },
    ],
  }
}

/** Close Multiple Tabs ▸ (Firefox): temp tabs only; pinned tabs never close in bulk. */
function closeMultiple(tab: Tab, space: Space, index: number): TabMenuItem {
  const closeAll = (list: Tab[]) => run(() => Promise.all(list.map((t) => closeTab(t.id))))
  const above = space.tempTabs.slice(0, index)
  const below = space.tempTabs.slice(index + 1)
  const others = space.tempTabs.filter((t) => t.id !== tab.id)
  return {
    label: "Close Multiple Tabs",
    items: [
      { label: "Close Tabs Above", disabled: above.length === 0, onSelect: closeAll(above) },
      { label: "Close Tabs Below", disabled: below.length === 0, onSelect: closeAll(below) },
      { label: "Close Other Tabs", disabled: others.length === 0, onSelect: closeAll(others) },
    ],
  }
}

/** Selecting a tab first when needed (the address field acts on the shown tab). */
export async function showTab(tabs: TabsState, tabId: Id) {
  if (tabs.activeTabId !== tabId) await activateTab(tabId)
}
