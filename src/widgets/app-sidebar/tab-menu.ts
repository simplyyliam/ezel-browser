import { commands } from "@/shared/bindings"
import { menuLabel, reportError, unwrap, type Id, type Space, type Tab, type TabsState } from "@/shared"
import type { MenuEntry, MenuGroups } from "@/shared/components"
import { hasFreeSlot, insertSwatch, swatchOrder } from "./swatch-moves"

// The right-click menus of tab rows and swatches. Items, groups and labels come from the menu
// catalog (shared/menus/catalog.ts, areas "tab" and "swatch"): browser-standard items plus Ezel's
// Swatches and address editing. Items that don't apply are left out, not dimmed (HIG
// context-menus.md).

/** Where a tab lives: what its menu can offer depends on it. */
type Place =
  | { kind: "swatch" }
  | { kind: "pinned"; space: Space; index: number }
  | { kind: "folder"; space: Space; folderId: Id }
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
      if (inFolder && item.kind === "folder") return { tab: inFolder, place: { kind: "folder", space, folderId: item.folder.id } }
    }
  }
  return null
}

/** A tab by id, wherever it is. */
export const findTab = (tabs: TabsState, tabId: Id) => locate(tabs, tabId)?.tab ?? null

type TabMenuContext = {
  tabs: TabsState
  activeSpaceId: Id
  /** Shows the tab and turns its name into the address field. */
  onEdit: (tabId: Id) => void
  /** After a new tab is open: its name field, empty, ready to type. */
  onOpened: (tabId: Id) => void
  /** After "New Folder with Tab": the folder's name opens as a field. */
  onFolderCreated: (folderId: Id) => void
}

/** Runs a menu action; failures are reported (the menu has closed, and state is the backend's anyway). */
const run = (action: string, task: () => Promise<unknown>) => () => {
  task().catch((error) => reportError(action, error))
}

/** What a new folder is called until it's renamed. */
const NEW_FOLDER_NAME = "New Folder"

export function tabMenu(tabId: Id, { tabs, activeSpaceId, onEdit, onOpened, onFolderCreated }: TabMenuContext): MenuGroups {
  const found = locate(tabs, tabId)
  if (!found) return []
  const { tab, place } = found
  const area = place.kind === "swatch" ? "swatch" : "tab"
  const temp = place.kind === "temp" ? place : null
  const swatchCount = swatchOrder(tabs.swatches).length

  /** A new temp tab right below a temp tab; otherwise on top of the temp tabs, the first place below. */
  const openBelow = async (input: string | null) => {
    const id = await unwrap("open tab", commands.openTab(input))
    if (id !== null && temp) {
      await unwrap("place new tab", commands.moveTab(id, { kind: "temp", spaceId: temp.space.id, index: temp.index + 1 }))
    }
    return id
  }
  const move = (action: string, to: Parameters<typeof commands.moveTab>[1]) =>
    run(action, () => unwrap(action, commands.moveTab(tab.id, to)))

  const pageGroup: MenuEntry[] = [
    ...(place.kind !== "swatch"
      ? [
          {
            label: menuLabel("tab", "newTabBelow"),
            onSelect: run("new tab below", async () => {
              const id = await openBelow(null)
              if (id !== null) onOpened(id)
            }),
          },
        ]
      : []),
    { label: menuLabel(area, "duplicate"), onSelect: run("duplicate tab", () => openBelow(tab.url)) },
    // Any loaded tab, shown or in the background (an unloaded one reloads when it's opened).
    ...(tab.isLoaded
      ? [{ label: menuLabel(area, "reload"), onSelect: run("reload tab", () => unwrap("reload tab", commands.reloadTab(tab.id))) }]
      : []),
    // Only while there's sound to silence, or a mute to undo (HIG: toggles name their next state).
    ...(tab.isPlayingAudio || tab.isMuted
      ? [
          {
            label: menuLabel(area, tab.isMuted ? "unmute" : "mute"),
            onSelect: run("mute tab", () => unwrap("mute tab", commands.setTabMuted(tab.id, !tab.isMuted))),
          },
        ]
      : []),
    { label: menuLabel(area, "copyLink"), onSelect: run("copy link", () => navigator.clipboard.writeText(tab.url)) },
  ]

  const keepGroup: MenuEntry[] =
    place.kind === "swatch"
      ? [
          {
            label: menuLabel("swatch", "removeFromSwatches"),
            onSelect: move("remove from swatches", { kind: "temp", spaceId: activeSpaceId, index: null }),
          },
        ]
      : [
          { label: menuLabel("tab", "changeUrl"), onSelect: () => onEdit(tab.id) },
          ...(hasFreeSlot(tabs.swatches)
            ? [
                {
                  label: menuLabel("tab", "addToSwatches"),
                  hint: `${swatchCount} / ${tabs.swatches.length}`,
                  // After the last swatch: a list to the user, though the backend has slots.
                  onSelect: run("add to swatches", () => insertSwatch(tab.id, swatchCount, tabs.swatches)),
                },
              ]
            : []),
          temp
            ? {
                label: menuLabel("tab", "pin"),
                onSelect: move("pin tab", { kind: "pinned", spaceId: temp.space.id, folderId: null, index: null }),
              }
            : {
                label: menuLabel("tab", "unpin"),
                onSelect: move("unpin tab", { kind: "temp", spaceId: place.space.id, index: null }),
              },
        ]

  const arrangeGroup: MenuEntry[] = [
    ...(place.kind === "temp" || place.kind === "pinned" ? [moveWithin(tab, place)] : []),
    ...(place.kind !== "swatch"
      ? [
          moveToFolder(tab, place),
          moveToSpace(tab, place, tabs.spaces),
          {
            label: menuLabel("tab", "newFolderWithTab"),
            onSelect: run("new folder with tab", async () => {
              const id = await unwrap("new folder with tab", commands.createFolderWithTab(tab.id, NEW_FOLDER_NAME))
              if (id !== null) onFolderCreated(id)
            }),
          },
        ]
      : []),
    ...(tab.isLoaded
      ? [{ label: menuLabel(area, "unload"), onSelect: run("unload tab", () => unwrap("unload tab", commands.unloadTab(tab.id))) }]
      : []),
  ]

  const closeGroup: MenuEntry[] = [
    { label: menuLabel(area, "close"), onSelect: run("close tab", () => unwrap("close tab", commands.closeTab(tab.id))) },
    ...(temp ? [closeMultiple(tab, temp.space, temp.index)] : []),
  ]

  // The page, keeping the tab, placing it, closing it (HIG: about three groups; placing grew with folders).
  return [pageGroup, keepGroup, arrangeGroup, closeGroup]
}

/** Move Tab ▸ to the start or end of its own list. Only the moves that change something. */
function moveWithin(tab: Tab, place: Extract<Place, { kind: "temp" | "pinned" }>): MenuEntry {
  const count = place.kind === "temp" ? place.space.tempTabs.length : place.space.items.length
  const to = (index: number) =>
    run("move tab", () =>
      unwrap(
        "move tab",
        commands.moveTab(
          tab.id,
          place.kind === "temp"
            ? { kind: "temp", spaceId: place.space.id, index }
            : { kind: "pinned", spaceId: place.space.id, folderId: null, index },
        ),
      ),
    )
  return {
    label: menuLabel("tab", "moveTab"),
    items: [
      ...(place.index > 0 ? [{ label: "Move to Start", onSelect: to(0) }] : []),
      // `move_tab` takes the tab out first: the last index is then count - 1.
      ...(place.index < count - 1 ? [{ label: "Move to End", onSelect: to(count - 1) }] : []),
    ],
  }
}

/** Move to Folder ▸ the space's folders (not its own): into the folder, at the end. */
function moveToFolder(tab: Tab, place: Exclude<Place, { kind: "swatch" }>): MenuEntry {
  const own = place.kind === "folder" ? place.folderId : null
  return {
    label: menuLabel("tab", "moveToFolder"),
    items: place.space.items.flatMap((item) =>
      item.kind === "folder" && item.folder.id !== own
        ? [
            {
              label: item.folder.name,
              onSelect: run("move to folder", () =>
                unwrap(
                  "move to folder",
                  commands.moveTab(tab.id, { kind: "pinned", spaceId: place.space.id, folderId: item.folder.id, index: null }),
                ),
              ),
            },
          ]
        : [],
    ),
  }
}

/** Move to Space ▸ the other spaces: a temp tab stays temp, a pinned one stays pinned (at the end). */
function moveToSpace(tab: Tab, place: Exclude<Place, { kind: "swatch" }>, spaces: Space[]): MenuEntry {
  const pinned = place.kind !== "temp"
  return {
    label: menuLabel("tab", "moveToSpace"),
    items: spaces
      .filter((space) => space.id !== place.space.id)
      .map((space) => ({
        label: space.name,
        onSelect: run("move to space", () =>
          unwrap(
            "move to space",
            commands.moveTab(
              tab.id,
              pinned
                ? { kind: "pinned", spaceId: space.id, folderId: null, index: null }
                : { kind: "temp", spaceId: space.id, index: null },
            ),
          ),
        ),
      })),
  }
}

/** Close Multiple Tabs ▸ (Firefox): temp tabs only; pinned tabs never close in bulk. */
function closeMultiple(tab: Tab, space: Space, index: number): MenuEntry {
  const closeAll = (list: Tab[]) =>
    run("close tabs", () => Promise.all(list.map((t) => unwrap("close tab", commands.closeTab(t.id)))))
  const above = space.tempTabs.slice(0, index)
  const below = space.tempTabs.slice(index + 1)
  const others = space.tempTabs.filter((t) => t.id !== tab.id)
  return {
    label: menuLabel("tab", "closeMultiple"),
    items: [
      ...(above.length > 0 ? [{ label: "Close Tabs Above", onSelect: closeAll(above) }] : []),
      ...(below.length > 0 ? [{ label: "Close Tabs Below", onSelect: closeAll(below) }] : []),
      ...(others.length > 0 ? [{ label: "Close Other Tabs", onSelect: closeAll(others) }] : []),
    ],
  }
}

/** Selecting a tab first when needed (the address field acts on the shown tab). */
export async function showTab(tabs: TabsState, tabId: Id) {
  if (tabs.activeTabId !== tabId) await unwrap("show tab", commands.activateTab(tabId))
}
