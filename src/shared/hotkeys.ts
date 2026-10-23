import { useEffect, useRef } from "react"
import { commands, events } from "./bindings"
import { isPopupOpen } from "./outside-press"
import { unwrap } from "./report-error"

// Every app shortcut in one place: its id, what it does, and its default keys. A settings page will
// let people rebind them; until then the defaults apply.
//
// A shortcut has to work wherever focus is. Pressed in the UI, it's a normal keydown. Pressed in the
// website (a native webview with no IPC), the UI never sees it: Rust catches the keys there, keeps
// them from the page and emits `hotkey-pressed` with the id. Rust learns the keys from
// `set_forwarded_hotkeys`, sent by `useHotkeys` (mounted once) whenever the list changes, so a
// rebinding reaches both paths. Components only call `useHotkey(id, handler)`.

/**
 * `key`: a–z, 0–9, f1–f12, tab, escape, left or right, lowercase (what Rust can map to a Windows
 * virtual key).
 */
export type Hotkey = { ctrl?: boolean; shift?: boolean; alt?: boolean; key: string }

type HotkeyDef = {
  label: string
  /** One combination, or several that do the same (F5 and Ctrl+R). The first is the one shown. */
  keys: Hotkey | readonly Hotkey[]
  /**
   * Pressed in the website: move keyboard focus to the UI first (anything that opens a field to
   * type in). Otherwise the page keeps focus (toggling the sidebar shouldn't take it).
   */
  focusUi: boolean
  /** The UI side is already handled by a registry component (shadcn's sidebar hears Ctrl+B itself). */
  builtIn?: boolean
  /**
   * Only while the shown page loads (Esc): otherwise the key belongs to the website (its dialogs)
   * or, in the UI, to whatever has focus (menus, fields), so it's never taken from them.
   */
  whileLoading?: boolean
}

/** Ctrl+1…8: the Swatches in grid order (only the ones that exist, as the grid shows them). */
const swatchHotkey = (n: number): HotkeyDef => ({ label: `Swatch ${n}`, keys: { ctrl: true, key: String(n) }, focusUi: false })

export const HOTKEYS = {
  /** A blank command palette; what it opens becomes a new tab. */
  newTab: { label: "New Tab", keys: { ctrl: true, key: "t" }, focusUi: true },
  /** The command palette holding the shown tab's URL; it loads in that tab. */
  editAddress: { label: "Change Address", keys: { ctrl: true, key: "l" }, focusUi: true },
  /** Chrome's Ctrl+K (search from the address bar): the same palette, for commands and lenses too. */
  commandPalette: { label: "Command Palette", keys: { ctrl: true, key: "k" }, focusUi: true },
  /** shadcn's SIDEBAR_KEYBOARD_SHORTCUT. Its key can't change until the sidebar's own listener goes. */
  toggleSidebar: { label: "Toggle Sidebar", keys: { ctrl: true, key: "b" }, focusUi: false, builtIn: true },
  /** Closes the shown tab (a pinned tab or swatch unloads, as its close button does). */
  closeTab: { label: "Close Tab", keys: { ctrl: true, key: "w" }, focusUi: false },
  /** The space's tabs in most-recently-used order; quick presses walk deeper (Rust's `cycle_tab`). */
  nextTab: { label: "Next Recent Tab", keys: { ctrl: true, key: "tab" }, focusUi: false },
  previousTab: { label: "Previous Recent Tab", keys: { ctrl: true, shift: true, key: "tab" }, focusUi: false },
  swatch1: swatchHotkey(1),
  swatch2: swatchHotkey(2),
  swatch3: swatchHotkey(3),
  swatch4: swatchHotkey(4),
  swatch5: swatchHotkey(5),
  swatch6: swatchHotkey(6),
  swatch7: swatchHotkey(7),
  swatch8: swatchHotkey(8),
  /** The last tab in the space's list (Chrome's Ctrl+9). */
  lastTab: { label: "Last Tab", keys: { ctrl: true, key: "9" }, focusUi: false },
  reload: { label: "Reload", keys: [{ ctrl: true, key: "r" }, { key: "f5" }], focusUi: false },
  hardReload: { label: "Reload Without Cache", keys: { ctrl: true, shift: true, key: "r" }, focusUi: false },
  back: { label: "Back", keys: { alt: true, key: "left" }, focusUi: false },
  forward: { label: "Forward", keys: { alt: true, key: "right" }, focusUi: false },
  stopLoading: { label: "Stop Loading", keys: { key: "escape" }, focusUi: false, whileLoading: true },
  /** The shown page's DevTools, in their own window. */
  devTools: { label: "Developer Tools", keys: [{ key: "f12" }, { ctrl: true, shift: true, key: "i" }], focusUi: false },
  /** The most recently closed tab, back where it was (Rust's closed-tab stack, 25 deep). */
  reopenClosedTab: { label: "Reopen Closed Tab", keys: { ctrl: true, shift: true, key: "t" }, focusUi: false },
  /** Lenses (Rust's page layers): the squint test (blur) and greyscale, on the shown tab. */
  squint: { label: "Squint", keys: { ctrl: true, alt: true, key: "s" }, focusUi: false },
  greyscale: { label: "Greyscale", keys: { ctrl: true, alt: true, key: "g" }, focusUi: false },
  /** Find in page: a small bar in the page's corner, its field focused. */
  find: { label: "Find in Page", keys: { ctrl: true, key: "f" }, focusUi: true },
  /** Chrome's bookmark key: Ezel's bookmarks are pinned tabs, so it pins the shown tab. */
  pinTab: { label: "Pin Tab", keys: { ctrl: true, key: "d" }, focusUi: false },
  /** Arc's and Zen's Ctrl+Shift+C: the page keeps focus, a toast confirms. */
  copyUrl: { label: "Copy Link", keys: { ctrl: true, shift: true, key: "c" }, focusUi: false },
} satisfies Record<string, HotkeyDef>

export type HotkeyId = keyof typeof HOTKEYS

/** Every combination bound to `id`, the shown one first. */
function bindingsOf(id: HotkeyId): readonly Hotkey[] {
  const { keys } = HOTKEYS[id] as HotkeyDef
  return Array.isArray(keys) ? keys : [keys as Hotkey]
}

/** `KeyboardEvent.key` in Hotkey terms: "ArrowLeft" → "left", "Tab" → "tab". */
function keyName(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  return key.startsWith("arrow") ? key.slice("arrow".length) : key
}

export function matchesHotkey(event: KeyboardEvent, id: HotkeyId) {
  const key = keyName(event)
  return bindingsOf(id).some(
    (keys) =>
      key === keys.key &&
      event.ctrlKey === !!keys.ctrl &&
      event.shiftKey === !!keys.shift &&
      event.altKey === !!keys.alt &&
      !event.metaKey,
  )
}

const KEY_LABELS: Record<string, string> = { tab: "Tab", escape: "Esc", left: "←", right: "→" }

/** "Ctrl+L" */
export function hotkeyLabel(id: HotkeyId) {
  const keys = bindingsOf(id)[0]
  const key = KEY_LABELS[keys.key] ?? keys.key.toUpperCase()
  return [keys.ctrl && "Ctrl", keys.alt && "Alt", keys.shift && "Shift", key].filter(Boolean).join("+")
}

/** A field, or anything else that takes typing, has focus in the UI. */
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))

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
    unwrap(
      "forward hotkeys",
      commands.setForwardedHotkeys(
        ids.flatMap((id) => {
          const { focusUi, whileLoading = false } = HOTKEYS[id] as HotkeyDef
          return bindingsOf(id).map((keys) => ({
            id,
            key: keys.key,
            ctrl: !!keys.ctrl,
            shift: !!keys.shift,
            alt: !!keys.alt,
            focusUi,
            whileLoading,
          }))
        }),
      ),
    )

    const unlisten = events.hotkeyPressed.listen((event) => {
      const { id } = event.payload
      if (id in HOTKEYS) run(id as HotkeyId)
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      const id = ids.find((candidate) => !(HOTKEYS[candidate] as HotkeyDef).builtIn && matchesHotkey(event, candidate))
      if (!id) return
      if ((HOTKEYS[id] as HotkeyDef).whileLoading) {
        // Esc in the UI is for what has focus there; only a bare UI hears it (the handler checks loading).
        if (event.defaultPrevented || isTyping(event.target) || isPopupOpen()) return
      } else {
        event.preventDefault()
      }
      run(id)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      unlisten.then((fn) => fn())
    }
  }, [])
}
