import { useSyncExternalStore } from "react"

// Who has the command palette open, and for what. Anything may open it (the sidebar's New Tab,
// its menus, shortcuts); only `widgets/command-palette` draws it.

/**
 * `new-tab`: the input opens a new temp tab (Arc's command bar, Zen's new-tab URL bar).
 * `current-tab`: the input loads in the shown tab, starting from its URL (Ctrl+L).
 */
export type PaletteTarget = "new-tab" | "current-tab"

/** `target` outlives `open`, so the palette keeps its content while it animates out. */
type PaletteState = { open: boolean; target: PaletteTarget; openedAt: number }

let state: PaletteState = { open: false, target: "new-tab", openedAt: 0 }
const subscribers = new Set<() => void>()

function set(next: PaletteState) {
  state = next
  subscribers.forEach((notify) => notify())
}

export function openCommandPalette(target: PaletteTarget) {
  // `openedAt` changes on every open, so the palette starts fresh even when it was already open.
  set({ open: true, target, openedAt: Date.now() })
}

export function closeCommandPalette() {
  if (state.open) set({ ...state, open: false })
}

const subscribe = (notify: () => void) => {
  subscribers.add(notify)
  return () => subscribers.delete(notify)
}

export const useCommandPalette = () => useSyncExternalStore(subscribe, () => state)
