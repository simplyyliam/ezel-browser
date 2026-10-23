import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  Link,
  Contrast,
  PanelLeft,
  RotateCw,
  ScanEye,
  Search,
  Trash2,
  type LucideIcon,
  ShieldCheck,
} from "lucide-react"
import { MotionConfig } from "motion/react"
import { Command, CommandList } from "@/components/ui/command"
import { Dialog, DialogPortal } from "@/components/ui/dialog"
import { useSidebar } from "@/components/ui/sidebar"
import { Footer } from "@/features/command-palette/footer"
import { Results, SwatchTiles, type PaletteRow, type PaletteSection } from "@/features/command-palette/results"
import { SearchField } from "@/features/command-palette/search-field"
import {
  activeSpace,
  closeCommandPalette,
  hotkeyLabel,
  LENSES,
  toggleLens,
  useHotkey,
  openCommandPalette,
  openSitePermissions,
  spaceIcon,
  unwrap,
  useCommandPalette,
  usePage,
  useTabs,
  type PageChanged,
  type PaletteTarget,
  type Space,
  type Tab,
  type TabsState,
} from "@/shared"
import { commands } from "@/shared/bindings"
import { Favicon, ScrollArea } from "@/shared/components"
import { completionFor, displayUrl, escapeRegExp, hostOf, resolveInput, scoreTab, siteIcon, tokensOf } from "./address"

const SEARCH_URL = "https://www.google.com/search?q="
/** Rows per list: enough to choose from, few enough to read at a glance. */
const MAX_TABS = 6

/**
 * The command palette: Ezel's address bar. New Tab opens it instead of a blank page (Arc's command
 * bar, Zen's floating new-tab URL bar); Ctrl+L opens it on the shown tab's address. It opens a site,
 * searches Google, jumps to any open tab in any space, or runs a few browser actions.
 * Drawn over the page: shadcn/Base UI portals it out of #root as "dialog-content", so
 * `usePopupCutouts` cuts it out of the website. No backdrop: it would dim the UI but not the page.
 */
export function CommandPalette() {
  const { open, target, openedAt } = useCommandPalette()
  const tabs = useTabs()
  const page = usePage()
  const { toggleSidebar } = useSidebar()
  const inputRef = useRef<HTMLInputElement>(null)

  // Ctrl+T: a blank palette (New Tab). Ctrl+L: the shown tab's URL, to change that tab's address
  // without opening a new one. Heard in the UI and, forwarded by Rust, in the website (shared/hotkeys).
  useHotkey("newTab", () => openCommandPalette("new-tab"))
  // No tab on screen: there's no address to change, so it's a new tab.
  const openOnShownTab = () => openCommandPalette(tabs?.activeTabId != null ? "current-tab" : "new-tab")
  useHotkey("editAddress", openOnShownTab)
  // Ctrl+K: Chrome's "search from the address bar"; typing replaces the selected URL, and actions
  // (lenses, Copy Link, Reload…) are found by name.
  useHotkey("commandPalette", openOnShownTab)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeCommandPalette()}>
      <DialogPortal>
        <DialogPrimitive.Popup
          // Picked up by usePopupCutouts (portaled "-content" slot), so it shows over the page.
          data-slot="dialog-content"
          initialFocus={inputRef}
          className={
            // Centred on the window, a little above the middle where the eye already is. No shadow:
            // over the page it would be clipped (docs/design/decisions.md), so a ring draws the edge.
            "fixed top-[16%] left-1/2 z-50 w-[min(600px,calc(100vw-2rem))] origin-top -translate-x-1/2 overflow-hidden rounded-2xl bg-popover text-popover-foreground ring-1 ring-foreground/10 outline-none " +
            // Fast in, slower out (decisions.md, Principles); reduced motion keeps only the fade.
            "transition-[opacity,scale] duration-[120ms] ease-out data-ending-style:duration-200 data-ending-style:opacity-0 data-ending-style:scale-[0.98] data-starting-style:opacity-0 data-starting-style:scale-[0.97] motion-reduce:scale-100!"
          }
        >
          <DialogPrimitive.Title className="sr-only">
            {target === "new-tab" ? "Open a new tab" : "Change this tab's address"}
          </DialogPrimitive.Title>
          {/* Keyed by the open: every open starts from a clean input. */}
          {tabs && (
            <PaletteBody
              key={openedAt}
              target={target === "current-tab" && tabs.activeTabId !== null ? "current-tab" : "new-tab"}
              tabs={tabs}
              page={page}
              inputRef={inputRef}
              onToggleSidebar={toggleSidebar}
            />
          )}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}

type PaletteBodyProps = {
  target: PaletteTarget
  tabs: TabsState
  page: PageChanged
  inputRef: RefObject<HTMLInputElement | null>
  onToggleSidebar: () => void
}

/** What a row does: `inNewTab` is Shift+Enter (open a site in a new tab instead of this one). */
type Runner = (inNewTab: boolean) => void

function PaletteBody({ target, tabs, page, inputRef, onToggleSidebar }: PaletteBodyProps) {
  const inCurrentTab = target === "current-tab"
  const initialQuery = inCurrentTab ? page.url : ""
  const [query, setQuery] = useState(initialQuery)
  // Untouched Ctrl+L input: it's the page's own address, so it isn't searched for.
  const pristine = query === initialQuery && inCurrentTab
  // Deleting turns autofill off until the next typed character, as in every address bar.
  const [completionOff, setCompletionOff] = useState(false)
  const [selectedId, setSelectedId] = useState("")
  const [doneId, setDoneId] = useState<string | null>(null)

  // Ctrl+L selects the address, so typing replaces it and Ctrl+C copies it.
  useEffect(() => {
    if (!inCurrentTab) return
    const frame = requestAnimationFrame(() => inputRef.current?.select())
    return () => cancelAnimationFrame(frame)
  }, [inCurrentTab, inputRef])

  function changeQuery(next: string) {
    setCompletionOff(next.length < query.length)
    setQuery(next)
  }

  const space = activeSpace(tabs)
  const shownTabId = tabs.activeTabId
  const trimmed = pristine ? "" : query.trim()
  const tokens = tokensOf(trimmed)
  const runners = new Map<string, Runner>()

  const open = (input: string, inNewTab: boolean) => {
    closeCommandPalette()
    if (inCurrentTab && !inNewTab) unwrap("navigate", commands.navigate(input))
    else unwrap("open tab", commands.openTab(input))
  }

  // ---- Open tabs, everywhere: swatches, then every space's pinned, folder and temp tabs. ----
  const located = locateTabs(tabs).filter(({ tab }) => tab.id !== shownTabId)
  const ranked = tokens.length
    ? located
        .map((entry) => ({ ...entry, score: scoreTab(entry.tab, tokens) }))
        .filter((entry): entry is typeof entry & { score: number } => entry.score !== null)
        // The active space breaks ties: it's what people are working in.
        .map((entry) => ({ ...entry, score: entry.score + (entry.space?.id === space?.id ? 5 : 0) }))
        .sort((a, b) => b.score - a.score)
    : located.filter((entry) => entry.space?.id === space?.id)

  // ---- What the typed text means: open it, or search it. ----
  const completion =
    !completionOff && trimmed && !trimmed.includes(" ")
      ? completionFor(
          trimmed,
          ranked.map(({ tab }) => hostOf(tab.url)).filter(Boolean),
        )
      : null
  const resolved = resolveInput(trimmed + (completion ?? ""))
  const primary: PaletteRow[] = []
  if (trimmed) {
    if (resolved.kind === "url") {
      primary.push({
        id: "go",
        icon: { kind: "favicon", src: siteIcon(resolved.host) },
        title: displayUrl(resolved.url),
        detail: inCurrentTab ? "in this tab" : undefined,
        hint: inCurrentTab ? "Go" : "Open",
      })
      runners.set("go", (inNewTab) => open(resolved.url, inNewTab))
    }
    // Always offered: "github.com" may be what someone wants to read about, not visit.
    primary.push({
      id: "search",
      icon: { kind: "glyph", icon: Search },
      title: trimmed,
      detail: "Google Search",
      hint: "Search",
    })
    runners.set("search", (inNewTab) => open(SEARCH_URL + encodeURIComponent(trimmed), inNewTab))
  }

  // ---- Swatches as tiles while nothing is typed in a new tab. ----
  const showTiles = !inCurrentTab && !trimmed
  const tiles = showTiles
    ? tabs.swatches
        .filter((tab): tab is Tab => tab !== null)
        .map((tab) => {
          const id = `swatch-${tab.id}`
          runners.set(id, () => switchTo(tab))
          return {
            id,
            icon: { kind: "favicon" as const, src: tab.favicon },
            title: tab.title ?? displayUrl(tab.url),
            hint: "Switch",
            dimmed: !tab.isLoaded,
            shown: tab.id === shownTabId,
          }
        })
    : []

  function switchTo(tab: Tab) {
    closeCommandPalette()
    unwrap("switch to tab", commands.activateTab(tab.id))
  }

  const tabRows: PaletteRow[] = ranked
    .filter(({ space: s }) => !(showTiles && s === null))
    .slice(0, MAX_TABS)
    .map(({ tab, space: s }) => {
      const id = `tab-${tab.id}`
      runners.set(id, () => switchTo(tab))
      const where = s === null ? "Swatch" : s.id !== space?.id ? s.name : null
      return {
        id,
        icon: { kind: "favicon" as const, src: tab.favicon },
        title: tab.title || displayUrl(tab.url),
        detail: [hostOf(tab.url), where].filter(Boolean).join(" · "),
        hint: "Switch to Tab",
        dimmed: !tab.isLoaded,
      }
    })

  // ---- Browser actions: found by typing their name (Arc's command bar), or shown for Ctrl+L. ----
  const hasPage = page.url !== ""
  const actions: (PaletteRow & { keywords: string; run: () => void })[] = [
    ...(hasPage
      ? [
          {
            id: "action-copy",
            icon: { kind: "glyph" as const, icon: Link },
            title: "Copy Link",
            detail: hotkeyLabel("copyUrl"),
            keywords: "copy url address share clipboard",
            hint: "Copy",
            run: () => {
              navigator.clipboard.writeText(page.url).then(
                () => {
                  // Stay a beat so the check is seen, then get out of the way.
                  setDoneId("action-copy")
                  setTimeout(closeCommandPalette, 650)
                },
                (error) => console.error("[copy link]", error),
              )
            },
          },
          {
            id: "action-reload",
            icon: { kind: "glyph" as const, icon: RotateCw },
            title: "Reload Page",
            detail: hotkeyLabel("reload"),
            keywords: "refresh",
            hint: "Reload",
            run: () => {
              closeCommandPalette()
              unwrap("reload", commands.reload())
            },
          },
        ]
      : []),
    // Lenses: found by name or what they do ("blur", "grey"). Toggles name their next state.
    ...(hasPage && shownTabId !== null
      ? (["squint", "greyscale"] as const).map((layer) => {
          const on = findShown(tabs, shownTabId)?.layers.includes(layer) ?? false
          const { name, hotkey } = LENSES[layer]
          return {
            id: `lens-${layer}`,
            icon: { kind: "glyph" as const, icon: layer === "squint" ? ScanEye : Contrast },
            title: `${name} Lens`,
            detail: `${on ? "On · " : ""}${hotkeyLabel(hotkey)}`,
            keywords:
              layer === "squint"
                ? "lens blur squint test hierarchy eye"
                : "lens greyscale grayscale grey gray colour color mono black white",
            hint: on ? "Turn Off" : "Turn On",
            run: () => (closeCommandPalette(), toggleLens(layer)),
          }
        })
      : []),
    ...(page.canGoBack
      ? [{ id: "action-back", icon: { kind: "glyph" as const, icon: ArrowLeft }, title: "Go Back", keywords: "previous history", hint: "Back", run: () => (closeCommandPalette(), unwrap("go back", commands.goBack())) }]
      : []),
    ...(page.canGoForward
      ? [{ id: "action-forward", icon: { kind: "glyph" as const, icon: ArrowRight }, title: "Go Forward", keywords: "next history", hint: "Forward", run: () => (closeCommandPalette(), unwrap("go forward", commands.goForward())) }]
      : []),
    {
      id: "action-permissions",
      icon: { kind: "glyph", icon: ShieldCheck },
      title: "Site Permissions",
      keywords: "camera microphone location clipboard allow block privacy settings",
      hint: "Open",
      run: () => (closeCommandPalette(), openSitePermissions()),
    },
    {
      id: "action-sidebar",
      icon: { kind: "glyph", icon: PanelLeft },
      title: "Toggle Sidebar",
      detail: hotkeyLabel("toggleSidebar"),
      keywords: "show hide dock compact",
      hint: "Toggle",
      run: () => (closeCommandPalette(), onToggleSidebar()),
    },
    ...(space && space.tempTabs.length > 0
      ? [
          {
            id: "action-clear",
            icon: { kind: "glyph" as const, icon: Trash2 },
            title: "Close Temporary Tabs",
            detail: `${space.tempTabs.length} in ${space.name}`,
            keywords: "clear trash clean all",
            hint: "Close",
            run: () => (closeCommandPalette(), unwrap("clear temp tabs", commands.clearTempTabs(space.id))),
          },
        ]
      : []),
    ...tabs.spaces
      .filter((s) => s.id !== space?.id)
      .map((s) => ({
        id: `space-${s.id}`,
        icon: { kind: "glyph" as const, icon: spaceIcon(s.icon) },
        title: `Go to ${s.name}`,
        keywords: "space switch",
        hint: "Switch",
        run: () => (closeCommandPalette(), unwrap("switch space", commands.switchSpace(s.id))),
      })),
  ]
  const actionRows = pristine
    ? actions.filter((action) => action.id === "action-copy" || action.id === "action-reload")
    : tokens.length
      ? actions.filter((action) => matchesAction(`${action.title} ${action.keywords}`, tokens))
      : []
  for (const action of actionRows) runners.set(action.id, action.run)

  const sections: PaletteSection[] = [
    { id: "primary", rows: primary },
    // Ctrl+L puts the page's own actions first: that's usually why it was pressed.
    ...(pristine ? [{ id: "actions", rows: actionRows }] : []),
    {
      id: "tabs",
      heading: tabRows.length ? (trimmed ? "Switch to Tab" : `In ${space?.name ?? "this space"}`) : undefined,
      rows: tabRows,
    },
    ...(!pristine ? [{ id: "actions", heading: actionRows.length ? "Actions" : undefined, rows: actionRows }] : []),
  ].filter((section) => section.rows.length > 0)

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return
    // Chrome's Ctrl+Enter: "github" becomes www.github.com.
    if (event.ctrlKey && /^[a-z0-9-]+$/i.test(trimmed)) {
      event.preventDefault()
      open(`https://www.${trimmed}.com`, event.shiftKey)
    } else if (event.shiftKey) {
      event.preventDefault()
      runners.get(selectedId)?.(true)
    }
  }

  // The leading icon: the site about to open, the page being edited, or a magnifier.
  const shownTab = pristine && shownTabId !== null ? findShown(tabs, shownTabId) : null
  const icon =
    resolved.kind === "url" && trimmed
      ? { key: `site-${resolved.host}`, node: <Favicon src={siteIcon(resolved.host)} className="size-[18px] bg-foreground/15" /> }
      : pristine && shownTab
        ? { key: "page", node: <Favicon src={shownTab.favicon} className="size-[18px] bg-foreground/15" /> }
        : { key: "search", node: <Search className="size-[18px]" aria-hidden /> }

  const footerKeys = [
    ...(completion ? [{ key: "Tab", label: "Complete" }] : []),
    ...(inCurrentTab && trimmed ? [{ key: "⇧↵", label: "New Tab" }] : []),
    ...(/^[a-z0-9-]+$/i.test(trimmed) ? [{ key: "Ctrl↵", label: ".com" }] : []),
    { key: "Esc", label: "Close" },
  ]
  const SpaceIcon: LucideIcon = space ? spaceIcon(space.icon) : AppWindow
  const destination = inCurrentTab
    ? { icon: AppWindow, label: "Opens in this tab" }
    : { icon: SpaceIcon, label: `New tab in ${space?.name ?? "this space"}` }

  const hasRows = tiles.length > 0 || sections.length > 0

  return (
    <MotionConfig reducedMotion="user">
      <Command
        shouldFilter={false}
        loop
        onValueChange={setSelectedId}
        onKeyDown={onKeyDown}
        className="rounded-none bg-transparent p-0"
      >
        <SearchField
          value={query}
          onValueChange={changeQuery}
          completion={completion}
          onAcceptCompletion={() => completion && setQuery(trimmed + completion)}
          onDismissCompletion={() => setCompletionOff(true)}
          icon={icon}
          placeholder={inCurrentTab ? "Enter an address or search" : "Search or enter an address"}
          inputRef={inputRef}
        />
        <ScrollArea
          className={hasRows ? "border-t border-border/50" : undefined}
          viewportClassName="max-h-[min(440px,56vh)]"
        >
          {/* cmdk measures its content into --cmdk-list-height; easing it makes the panel grow and shrink smoothly. */}
          <CommandList className="h-(--cmdk-list-height) max-h-none overflow-visible p-1 transition-[height] duration-150 ease-out motion-reduce:transition-none">
            {tiles.length > 0 && <SwatchTiles tiles={tiles} selectedId={selectedId} onRun={(row) => runners.get(row.id)?.(false)} />}
            <Results
              sections={sections}
              selectedId={selectedId}
              tokens={tokens}
              doneId={doneId}
              onRun={(row) => runners.get(row.id)?.(false)}
            />
          </CommandList>
        </ScrollArea>
        <Footer destination={destination} keys={footerKeys} />
      </Command>
    </MotionConfig>
  )
}

type LocatedTab = { tab: Tab; space: Space | null }

/** Every tab with the space it lives in (null: a swatch, shared by all spaces). */
function locateTabs(tabs: TabsState): LocatedTab[] {
  const located: LocatedTab[] = tabs.swatches.filter((tab): tab is Tab => tab !== null).map((tab) => ({ tab, space: null }))
  for (const space of tabs.spaces) {
    for (const item of space.items) {
      for (const tab of item.kind === "tab" ? [item.tab] : item.folder.tabs) located.push({ tab, space })
    }
    for (const tab of space.tempTabs) located.push({ tab, space })
  }
  return located
}

const findShown = (tabs: TabsState, id: number) => locateTabs(tabs).find(({ tab }) => tab.id === id)?.tab ?? null

/** Every typed word starts one of the action's words: "rel" finds Reload, "tog side" Toggle Sidebar. */
const matchesAction = (text: string, tokens: string[]) =>
  tokens.every((token) => new RegExp(`\\b${escapeRegExp(token)}`, "i").test(text))
