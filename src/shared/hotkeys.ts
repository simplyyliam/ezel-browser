import { useEffect, useRef } from "react"
import { onHotkeyPressed, onToggleSidebar, setForwardedHotkeys } from "./tauri"
import { reportError } from "./report-error"

// Every app shortcut in one place: its id, what it does, and its default keys. A settings page will
// let people rebind them; until then the defaults apply.
//
// A shortcut has to work wherever focus is. Pressed in the UI, it's a normal keydown. Pressed in the
// website (a native webview with no IPC), the UI never sees it: Rust catches the keys there, keeps
// them from the page and emits `hotkey-pressed` with the id. Rust learns the keys from
// `set_forwarded_hotkeys`, sent by `useHotkeys` (mounted once) whenever the list changes, so a
// rebinding reaches both paths. Components only call `useHotkey(id, handler)`.

/** `key`: a–z, 0–9 or f1–f12, lowercase (what Rust can map to a Windows virtual key). */
export type Hotkey = { ctrl?: boolean; shift?: boolean; alt?: boolean; key: string }

type HotkeyDef = {
  label: string
  keys: Hotkey
  /**
   * Pressed in the website: move keyboard focus to the UI first (anything that opens a field to
   * type in). Otherwise the page keeps focus (toggling the sidebar shouldn't take it).
   */
  focusUi: boolean
  /** The UI side is already handled by a registry component (shadcn's sidebar hears Ctrl+B itself). */
  builtIn?: boolean
}

export const HOTKEYS = {
  /** A blank command palette; what it opens becomes a new tab. */
  newTab: { label: "New Tab", keys: { ctrl: true, key: "t" }, focusUi: true },
  /** The command palette holding the shown tab's URL; it loads in that tab. */
  editAddress: { label: "Change Address", keys: { ctrl: true, key: "l" }, focusUi: true },
  /** shadcn's SIDEBAR_KEYBOARD_SHORTCUT. Its key can't change until the sidebar's own listener goes. */
  toggleSidebar: { label: "Toggle Sidebar", keys: { ctrl: true, key: "b" }, focusUi: false, builtIn: true },
} satisfies Record<string, HotkeyDef>

export type HotkeyId = keyof typeof HOTKEYS

export function matchesHotkey(event: KeyboardEvent, id: HotkeyId) {
  const keys: Hotkey = HOTKEYS[id].keys
  return (
    event.key.toLowerCase() === keys.key &&
    event.ctrlKey === !!keys.ctrl &&
    event.shiftKey === !!keys.shift &&
    event.altKey === !!keys.alt &&
    !event.metaKey
  )
}

/** "Ctrl+L" */
export function hotkeyLabel(id: HotkeyId) {
  const keys: Hotkey = HOTKEYS[id].keys
  return [keys.ctrl && "Ctrl", keys.alt && "Alt", keys.shift && "Shift", keys.key.toUpperCase()].filter(Boolean).join("+")
}

const handlers = new Map<HotkeyId, Set<() => void>>()

function run(id: HotkeyId) {
  handlers.get(id)?.forEach((handler) => handler())
}

/** Runs `handler` when the shortcut is pressed, in the UI or in the website. */
export function useHotkey(id: HotkeyId, handler: () => void) {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    const call = () => handlerRef.current()
    const set = handlers.get(id) ?? new Set()
    set.add(call)
    handlers.set(id, set)
    return () => {
      set.delete(call)
    }
  }, [id])
}

/**
 * Tells Rust which keys to catch in the website and dispatches every shortcut, wherever it was
 * pressed, to its `useHotkey` handlers. Mount once (AppLayout).
 */
export function useHotkeys() {
  useEffect(() => {
    const ids = Object.keys(HOTKEYS) as HotkeyId[]
    setForwardedHotkeys(
      ids.map((id) => {
        const { keys, focusUi } = HOTKEYS[id] as HotkeyDef
        return { id, key: keys.key, ctrl: !!keys.ctrl, shift: !!keys.shift, alt: !!keys.alt, focusUi }
      }),
    ).catch((error) => reportError("forward hotkeys", error))

    const unlisten = onHotkeyPressed((id) => {
      if (id in HOTKEYS) run(id as HotkeyId)
    })

    // Legacy Ctrl+B forwarding, until the backend sends it as "hotkey-pressed" too.
    const unlistenLegacy = onToggleSidebar(() => run("toggleSidebar"))

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      const id = ids.find((candidate) => !(HOTKEYS[candidate] as HotkeyDef).builtIn && matchesHotkey(event, candidate))
      if (!id) return
      event.preventDefault()
      run(id)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      unlisten.then((fn) => fn())
      unlistenLegacy.then((fn) => fn())
    }
  }, [])
}
