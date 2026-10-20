import { commands } from "./bindings"
import { useHotkey } from "./hotkeys"
import { usePage } from "./page"
import { reportError, unwrap } from "./report-error"
import { activeSpace, useTabs } from "./tabs-store"
import { showToast } from "./toast"
import type { Space, Tab, TabsState } from "./types"

// The browser's standard shortcuts (Chrome, Zen, Arc), acting on the shown tab or the active space.
// The keys live in HOTKEYS (shared/hotkeys.ts); this only says what each one does. Every action is
// a command: the result comes back through `tabs-changed` / `page-changed`.

/** The n-th swatch as the grid shows it (only filled slots, in slot order), 1-based. */
export function nthSwatch(tabs: TabsState, n: number): Tab | null {
  return tabs.swatches.filter((tab): tab is Tab => tab !== null)[n - 1] ?? null
}

/** The bottom row of the space's list: its last temp tab, else its last pinned or folder tab. */
export function lastTabOf(space: Space): Tab | null {
  const pinned = space.items.flatMap((item) => (item.kind === "tab" ? [item.tab] : item.folder.tabs))
  return [...pinned, ...space.tempTabs].at(-1) ?? null
}

function hostOf(url: string) {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

async function copyUrl() {
  try {
    const result = await commands.copyPageUrl()
    if (result.status === "ok") showToast({ title: "Link copied", detail: hostOf(result.data) })
    else if (result.error.code === "no_tab_shown") showToast({ title: "No page to copy", tone: "info" })
    else {
      reportError("copy link", result.error)
      showToast({ title: "Couldn't copy the link", tone: "info" })
    }
  } catch (error) {
    reportError("copy link", error)
  }
}

/** Wires the standard browser shortcuts. Mount once (AppLayout). */
export function useBrowserHotkeys() {
  const tabs = useTabs()
  const page = usePage()

  const activate = (tab: Tab | null) => tab && unwrap("activate tab", commands.activateTab(tab.id))

  useHotkey("closeTab", () => {
    if (tabs?.activeTabId != null) unwrap("close tab", commands.closeTab(tabs.activeTabId))
  })
  useHotkey("nextTab", () => unwrap("next tab", commands.cycleTab(false)))
  useHotkey("previousTab", () => unwrap("previous tab", commands.cycleTab(true)))
  const swatch = (n: number) => () => tabs && activate(nthSwatch(tabs, n))
  useHotkey("swatch1", swatch(1))
  useHotkey("swatch2", swatch(2))
  useHotkey("swatch3", swatch(3))
  useHotkey("swatch4", swatch(4))
  useHotkey("swatch5", swatch(5))
  useHotkey("swatch6", swatch(6))
  useHotkey("swatch7", swatch(7))
  useHotkey("swatch8", swatch(8))
  useHotkey("lastTab", () => {
    const space = tabs && activeSpace(tabs)
    if (space) activate(lastTabOf(space))
  })
  useHotkey("reload", () => unwrap("reload", commands.reload()))
  useHotkey("hardReload", () => unwrap("reload without cache", commands.hardReload()))
  useHotkey("back", () => page.canGoBack && unwrap("go back", commands.goBack()))
  useHotkey("forward", () => page.canGoForward && unwrap("go forward", commands.goForward()))
  useHotkey("stopLoading", () => page.isLoading && unwrap("stop loading", commands.stopLoading()))
  useHotkey("devTools", () => unwrap("open developer tools", commands.openDevtools()))
  useHotkey("copyUrl", copyUrl)
}
