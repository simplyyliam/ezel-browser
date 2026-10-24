import { menuLabel, type Id, type Space } from "@/shared"
import type { MenuGroups } from "@/shared/components"

// A space's right-click menu (catalog area "space"), from its title row.
// The widget builds it, as it does the tab menu: it holds the commands and the UI state (which
// space is being renamed, picking an icon, being deleted). Items that don't apply are left out.

export type SpaceMenuActions = {
  rename: (spaceId: Id) => void
  changeIcon: (spaceId: Id) => void
  setCollapsed: (spaceId: Id, collapsed: boolean) => void
  move: (spaceId: Id, index: number) => void
  unload: (spaceId: Id) => void
  /** Asks first, unless the space is empty. */
  delete: (spaceId: Id) => void
}

/** Every tab a space holds: pinned, in folders, temp. */
export function tabsOf(space: Space) {
  return [...space.items.flatMap((item) => (item.kind === "tab" ? [item.tab] : item.folder.tabs)), ...space.tempTabs]
}

export function spaceMenu(space: Space, spaces: Space[], shownTabId: Id | null, actions: SpaceMenuActions): MenuGroups {
  const index = spaces.findIndex((s) => s.id === space.id)
  const unloadable = tabsOf(space).some((tab) => tab.isLoaded && tab.id !== shownTabId)
  return [
    [
      { label: menuLabel("space", "rename"), onSelect: () => actions.rename(space.id) },
      { label: menuLabel("space", "changeIcon"), onSelect: () => actions.changeIcon(space.id) },
      // Only a space with a pinned list has something to fold away.
      ...(space.items.length > 0
        ? [
            {
              label: menuLabel("space", space.collapsed ? "expand" : "collapse"),
              onSelect: () => actions.setCollapsed(space.id, !space.collapsed),
            },
          ]
        : []),
    ],
    [
      ...(index > 0 ? [{ label: menuLabel("space", "moveUp"), onSelect: () => actions.move(space.id, index - 1) }] : []),
      ...(index < spaces.length - 1 ? [{ label: menuLabel("space", "moveDown"), onSelect: () => actions.move(space.id, index + 1) }] : []),
      ...(unloadable ? [{ label: menuLabel("space", "unload"), onSelect: () => actions.unload(space.id) }] : []),
    ],
    // The last space can't go (the backend refuses), so it isn't offered.
    spaces.length > 1 ? [{ label: menuLabel("space", "delete"), onSelect: () => actions.delete(space.id), destructive: true }] : [],
  ]
}
