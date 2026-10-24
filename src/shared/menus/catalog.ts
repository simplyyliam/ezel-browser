// The menu catalog: every place in Ezel where a right-click (or a menu button) opens a menu, and
// what belongs in it. Built menus take their labels from here (`menuLabel`), so this file and the
// UI can't drift apart. Before building a new menu, look its area up here: the items, groups,
// order and rules are already decided.
//
// Studied (2026-10-19): Zen's menus (zen-browser/desktop locales: zen-workspaces, zen-folders,
// zen-vertical-tabs, zen-general; the tab menu), Firefox's tab, page, link, image and toolbar menus
// (which Zen builds on), Chrome's and Safari's equivalents, and Arc's documented menus. Checked
// against Apple's HIG (apple-design skill): context-menus.md, menus.md, pop-up-buttons.md,
// pull-down-buttons.md, alerts.md.
//
// What goes in:
// - `browser`: what every browser has (Firefox/Chrome/Safari). Always fair game.
// - `ezel`: Ezel's own concepts (Swatches, the address in the tab's name, spaces and folders as
//   Ezel builds them).
// - `designer`: Ezel-only tools for designers. Ezel's point of view; nobody else has them.
// Zen-only or Arc-only features (split view, tab labels/icons, boosts, live folders, profiles per
// space, routes) are not copied.

/** The rules every menu follows. Cite these when a menu is reviewed. */
export const MENU_RULES = [
  // context-menus.md › Best practices
  "Only what applies to the thing that was right-clicked. A command lives in the one area whose object it acts on; it appears in two areas only when it acts on both objects (Close Tab on a row and on a swatch).",
  "Hide items that don't apply; don't dim them (context-menus.md › Hide unavailable menu items). Pop-up and pull-down menus are regular menus: there, dim instead (menus.md › Labels).",
  "About three groups, separated; the most used first; destructive items last (context-menus.md › Best practices).",
  "Submenus one level deep, about five items, titled so their contents are predictable (Move Tab ▸, Close Multiple Tabs ▸). Lists people build (spaces) may be longer (menus.md › Submenus).",
  "No keyboard shortcuts in context menus (context-menus.md). Counts that explain availability are fine (Add to Swatches 3 / 8).",
  "Title Case labels, verb first, no articles; … when more input follows: a field, a picker or a confirmation (menus.md › Labels).",
  "Toggles change their label with the state (Pin Tab / Unpin Tab, Mute Tab / Unmute Tab) (menus.md › Toggled items).",
  "Uncommon, irreversible destruction (Delete Space…, Delete Folder…) asks first in an alert: title names the thing, Cancel plus a verb button, never OK. Common or undoable removal doesn't ask (alerts.md › Best practices, Buttons).",
  "Everything in a context menu is also reachable in the main interface (context-menus.md), e.g. the footer's space icons and the + menu.",
  "The website is a native webview drawn above the UI: menus open inside the sidebar where possible (side/align); usePopupCutouts keeps the rest visible.",
] as const

/** built: in the app. planned: buildable with today's commands. needs-backend: a Rust command is missing. needs-feature: the feature itself isn't built. */
export type MenuStatus = "built" | "planned" | "needs-backend" | "needs-feature"
export type MenuOrigin = "browser" | "ezel" | "designer"

export interface CatalogItem {
  id: string
  label: string
  origin: MenuOrigin
  status: MenuStatus
  /** When it shows (otherwise hidden). */
  when?: string
  /** Last in the menu, confirmed by an alert when irreversible. */
  destructive?: boolean
  /** A submenu's items (one level). */
  submenu?: readonly string[]
  /** Commands it uses, or what's missing. */
  uses?: string
  note?: string
}

export interface MenuArea {
  /** context: right-click. pop-up: picks one of many (shows the choice). pull-down: a button's actions. */
  kind: "context" | "pop-up" | "pull-down"
  /** What opens it. */
  trigger: string
  /** The object its items act on; nothing else belongs in it. */
  scope: string
  groups: readonly (readonly CatalogItem[])[]
  /** Items people might expect here but that live elsewhere, and where. */
  notHere?: readonly { label: string; lives: string }[]
}

const item = <const T extends CatalogItem>(entry: T) => entry

export const MENU_CATALOG = {
  // ---- Sidebar ----

  sidebar: {
    kind: "context",
    trigger: "Right-click empty sidebar space",
    scope: "The sidebar itself, and making things in the shown space",
    groups: [
      [item({ id: "compactMode", label: "Compact Mode", origin: "ezel", status: "built", note: "Checkmark toggle: sidebar peeks from the left edge" })],
      [
        item({ id: "newTab", label: "New Tab", origin: "browser", status: "built", uses: "open_tab" }),
        item({ id: "reopenClosed", label: "Reopen Closed Tab", origin: "browser", status: "built", when: "a closed tab to reopen (closedCount > 0)", uses: "reopen_closed_tab", note: "Not on tab rows: it restores another tab, not the one right-clicked" }),
        item({ id: "newFolder", label: "New Folder", origin: "ezel", status: "built", uses: "create_folder", note: "At the end of the shown space's pinned list; its name opens as a field" }),
      ],
      [item({ id: "editTheme", label: "Edit Theme…", origin: "ezel", status: "needs-feature", note: "Theme editor (theme/ setTokens)" })],
    ],
    notHere: [{ label: "New Space", lives: "add (pull-down)" }],
  },

  tab: {
    kind: "context",
    trigger: "Right-click a tab row (pinned, folder or temp)",
    scope: "That tab",
    groups: [
      [
        item({ id: "newTabBelow", label: "New Tab Below", origin: "browser", status: "built", uses: "open_tab + move_tab", note: "Opens its name field, empty" }),
        item({ id: "duplicate", label: "Duplicate Tab", origin: "browser", status: "built", uses: "open_tab + move_tab" }),
        item({ id: "reload", label: "Reload Tab", origin: "browser", status: "built", when: "loaded (shown or not)", uses: "reload_tab" }),
        item({ id: "mute", label: "Mute Tab", origin: "browser", status: "built", when: "playing audio, not muted", uses: "set_tab_muted" }),
        item({ id: "unmute", label: "Unmute Tab", origin: "browser", status: "built", when: "muted", uses: "set_tab_muted" }),
        item({ id: "copyLink", label: "Copy Link", origin: "browser", status: "built" }),
      ],
      [
        item({ id: "changeUrl", label: "Change URL…", origin: "ezel", status: "built", note: "The name becomes the address field" }),
        item({ id: "addToSwatches", label: "Add to Swatches", origin: "ezel", status: "built", when: "a free slot (shows n / 8)", uses: "move_tab" }),
        item({ id: "pin", label: "Pin Tab", origin: "browser", status: "built", when: "a temp tab (Unpin Tab when pinned)", uses: "move_tab" }),
        item({ id: "unpin", label: "Unpin Tab", origin: "browser", status: "built", when: "a pinned or folder tab", uses: "move_tab" }),
        item({ id: "moveTab", label: "Move Tab", origin: "browser", status: "built", submenu: ["Move to Start", "Move to End"], when: "temp or top-level pinned", uses: "move_tab" }),
        item({ id: "moveToSpace", label: "Move to Space", origin: "ezel", status: "built", submenu: ["<other spaces>"], when: "2+ spaces, not a swatch", uses: "move_tab" }),
        item({ id: "newFolderWithTab", label: "New Folder with Tab", origin: "ezel", status: "built", when: "a list row", uses: "create_folder_with_tab", note: "The folder takes the tab's place; its name opens as a field" }),
        item({ id: "moveToFolder", label: "Move to Folder", origin: "ezel", status: "built", submenu: ["<the space's other folders>"], when: "the space has another folder", uses: "move_tab" }),
        item({ id: "unload", label: "Unload Tab", origin: "browser", status: "built", when: "loaded", uses: "unload_tab" }),
      ],
      [
        item({ id: "close", label: "Close Tab", origin: "browser", status: "built", uses: "close_tab", note: "Pinned tabs unload and reset instead" }),
        item({ id: "closeMultiple", label: "Close Multiple Tabs", origin: "browser", status: "built", submenu: ["Close Tabs Above", "Close Tabs Below", "Close Other Tabs"], when: "a temp tab with others", uses: "close_tab" }),
      ],
    ],
    notHere: [
      { label: "Reopen Closed Tab", lives: "sidebar (it acts on the closed-tab history, not this tab)" },
      { label: "Bookmark / Share / Send to Device", lives: "nowhere yet: no such features" },
    ],
  },

  swatch: {
    kind: "context",
    trigger: "Right-click a swatch",
    scope: "That swatch's tab",
    groups: [
      [
        item({ id: "reload", label: "Reload Tab", origin: "browser", status: "built", when: "loaded (shown or not)", uses: "reload_tab" }),
        item({ id: "duplicate", label: "Duplicate Tab", origin: "browser", status: "built", uses: "open_tab" }),
        item({ id: "mute", label: "Mute Tab", origin: "browser", status: "built", when: "playing audio, not muted", uses: "set_tab_muted" }),
        item({ id: "unmute", label: "Unmute Tab", origin: "browser", status: "built", when: "muted", uses: "set_tab_muted" }),
        item({ id: "copyLink", label: "Copy Link", origin: "browser", status: "built" }),
      ],
      [
        item({ id: "removeFromSwatches", label: "Remove from Swatches", origin: "ezel", status: "built", uses: "move_tab", note: "Goes to the top of the shown space's temp tabs" }),
        item({ id: "unload", label: "Unload Tab", origin: "browser", status: "built", when: "loaded", uses: "unload_tab" }),
      ],
      [item({ id: "close", label: "Close Tab", origin: "browser", status: "built", uses: "close_tab", note: "Unloads and resets to its pinned URL" })],
    ],
    notHere: [
      { label: "Change URL…", lives: "tab (swatches have no name field)" },
      { label: "Pin / Unpin, Move Tab, Close Multiple Tabs", lives: "tab" },
    ],
  },

  folder: {
    kind: "context",
    trigger: "Right-click a folder row",
    scope: "That folder (its tabs as a group)",
    groups: [
      [
        item({ id: "rename", label: "Rename Folder…", origin: "ezel", status: "built", uses: "rename_folder", note: "Inline, like a space's name" }),
        item({ id: "newTabInFolder", label: "New Tab in Folder", origin: "ezel", status: "built", uses: "open_tab + move_tab", note: "Opens its name field, empty" }),
      ],
      [
        item({ id: "collapse", label: "Collapse Folder", origin: "ezel", status: "built", when: "open", uses: "set_folder_collapsed" }),
        item({ id: "expand", label: "Expand Folder", origin: "ezel", status: "built", when: "collapsed", uses: "set_folder_collapsed" }),
        item({ id: "unload", label: "Unload Folder", origin: "ezel", status: "built", when: "a loaded tab inside", uses: "unload_folder" }),
        item({ id: "moveToSpace", label: "Move to Space", origin: "ezel", status: "built", submenu: ["<other spaces>"], when: "2+ spaces", uses: "move_folder" }),
      ],
      [
        item({ id: "unpack", label: "Unpack Folder", origin: "ezel", status: "built", when: "it holds tabs", uses: "delete_folder(keepTabs: true)", note: "Tabs stay pinned where it was" }),
        item({ id: "delete", label: "Delete Folder…", origin: "ezel", status: "built", destructive: true, uses: "delete_folder(keepTabs: false)", note: "Alert when it holds tabs: they go too (onto the closed-tab stack)" }),
      ],
    ],
  },

  space: {
    kind: "context",
    trigger: "Right-click the space's title row, or its icon in the footer",
    scope: "The shown space",
    groups: [
      [
        item({ id: "rename", label: "Rename Space…", origin: "ezel", status: "built", uses: "update_space", note: "Inline: the title becomes a plain field" }),
        item({ id: "changeIcon", label: "Change Icon…", origin: "ezel", status: "built", uses: "update_space", note: "Emoji (searchable, the system's) or icons, in a popover under the title" }),
        item({ id: "collapse", label: "Collapse Space", origin: "ezel", status: "built", when: "open", uses: "set_space_collapsed", note: "Its pinned list folds away under the title (a click on the title does the same)" }),
        item({ id: "expand", label: "Expand Space", origin: "ezel", status: "built", when: "collapsed", uses: "set_space_collapsed" }),
      ],
      [
        item({ id: "moveUp", label: "Move Up", origin: "ezel", status: "built", when: "not first", uses: "move_space", note: "Up the list; left among the footer's icons" }),
        item({ id: "moveDown", label: "Move Down", origin: "ezel", status: "built", when: "not last", uses: "move_space" }),
        item({ id: "unload", label: "Unload Space", origin: "ezel", status: "built", when: "a loaded tab other than the shown one", uses: "unload_tab", note: "Keeps the page you're looking at" }),
      ],
      [
        item({ id: "delete", label: "Delete Space…", origin: "ezel", status: "built", destructive: true, when: "2+ spaces", uses: "delete_space(moveTo)", note: "Alert (not for an empty space): move its tabs and folders to another space (default: the one shown next) or close them" }),
      ],
    ],
    notHere: [
      { label: "New Space, switching", lives: "the + menu; the footer's space icons and swipe" },
      { label: "Clear Temporary Tabs", lives: "the temp tabs' header (Clear)" },
    ],
  },

  add: {
    kind: "pull-down",
    trigger: "The + button at the bottom",
    scope: "Making a new thing",
    groups: [
      [
        item({ id: "newTab", label: "New Tab", origin: "browser", status: "built", uses: "open_tab" }),
        item({ id: "newFolder", label: "New Folder", origin: "ezel", status: "built", uses: "create_folder" }),
        item({ id: "newSpace", label: "New Space", origin: "ezel", status: "built", uses: "create_space" }),
      ],
    ],
  },

  // ---- Toolbar buttons ----

  history: {
    kind: "context",
    trigger: "Right-click (or press and hold) Back or Forward",
    scope: "The shown tab's history in that direction",
    groups: [[item({ id: "entry", label: "<page title>", origin: "browser", status: "needs-backend", uses: "missing: tab history list + go_to_index" })]],
  },

  reload: {
    kind: "context",
    trigger: "Right-click the reload button",
    scope: "The shown page",
    groups: [
      [
        item({ id: "reload", label: "Reload", origin: "browser", status: "built", uses: "reload" }),
        item({ id: "hardReload", label: "Reload Without Cache", origin: "browser", status: "needs-backend", uses: "missing: reload(bypassCache)" }),
      ],
    ],
  },

  // ---- Text ----

  address: {
    kind: "context",
    trigger: "Right-click a tab's name while it's the address field",
    scope: "The address being typed",
    groups: [
      [
        item({ id: "undo", label: "Undo", origin: "browser", status: "built", note: "WebView2's own text menu today" }),
        item({ id: "redo", label: "Redo", origin: "browser", status: "built" }),
      ],
      [
        item({ id: "cut", label: "Cut", origin: "browser", status: "built" }),
        item({ id: "copy", label: "Copy", origin: "browser", status: "built" }),
        item({ id: "paste", label: "Paste", origin: "browser", status: "built" }),
        item({ id: "pasteAndGo", label: "Paste and Go", origin: "browser", status: "planned", uses: "navigate", note: "Needs our own text menu" }),
        item({ id: "selectAll", label: "Select All", origin: "browser", status: "built" }),
      ],
    ],
  },

  // ---- The website (native webview; Ezel draws the menu from WebView2's ContextMenuRequested:
  // src-tauri/src/browser/page_menu.rs decides the entries, features/browser-view/page-menu draws them) ----

  page: {
    kind: "context",
    trigger: "Right-click the page background",
    scope: "The page",
    groups: [
      [
        item({ id: "back", label: "Back", origin: "browser", status: "built", note: "Dimmed without history" }),
        item({ id: "forward", label: "Forward", origin: "browser", status: "built", note: "Dimmed without history" }),
        item({ id: "reload", label: "Reload", origin: "browser", status: "built" }),
      ],
      [
        item({ id: "savePage", label: "Save Page As…", origin: "browser", status: "needs-backend" }),
        item({ id: "print", label: "Print…", origin: "browser", status: "needs-backend" }),
        item({ id: "capturePage", label: "Capture Page", origin: "designer", status: "needs-backend", note: "Full-page screenshot to the clipboard or a file" }),
      ],
      [
        item({ id: "pickColor", label: "Pick Color", origin: "designer", status: "needs-backend", note: "Eyedropper at the pointer; copies HEX / OKLCH" }),
        item({ id: "viewSource", label: "View Page Source", origin: "browser", status: "needs-backend" }),
        item({ id: "inspect", label: "Inspect", origin: "browser", status: "built", note: "Last in every page menu (WebView2's inspectElement)" }),
      ],
    ],
  },

  link: {
    kind: "context",
    trigger: "Right-click a link on the page",
    scope: "The link's address",
    groups: [
      [
        item({ id: "openInNewTab", label: "Open Link in New Tab", origin: "browser", status: "built", note: "A temp tab on top, not selected and not loaded until opened" }),
        item({ id: "openInSpace", label: "Open Link in Space", origin: "ezel", status: "needs-backend", submenu: ["<spaces>"] }),
        item({ id: "addToSwatches", label: "Add Link to Swatches", origin: "ezel", status: "needs-backend" }),
      ],
      [
        item({ id: "copyLink", label: "Copy Link", origin: "browser", status: "built" }),
        item({ id: "copyLinkText", label: "Copy Link Text", origin: "browser", status: "needs-backend" }),
      ],
    ],
  },

  image: {
    kind: "context",
    trigger: "Right-click an image on the page",
    scope: "That image",
    groups: [
      [item({ id: "openInNewTab", label: "Open Image in New Tab", origin: "browser", status: "built" })],
      [
        item({ id: "copyImage", label: "Copy Image", origin: "browser", status: "built" }),
        item({ id: "copyImageAddress", label: "Copy Image Address", origin: "browser", status: "built" }),
        item({ id: "copySvg", label: "Copy as SVG", origin: "designer", status: "needs-backend", when: "an inline or linked SVG" }),
        item({ id: "saveImage", label: "Save Image As…", origin: "browser", status: "built", note: "WebView2's save dialog" }),
      ],
      [item({ id: "extractPalette", label: "Copy Palette", origin: "designer", status: "needs-backend", note: "Dominant colours of the image as swatch values" })],
    ],
  },

  selection: {
    kind: "context",
    trigger: "Right-click selected text on the page",
    scope: "The selected text",
    groups: [
      [
        item({ id: "copy", label: "Copy", origin: "browser", status: "built" }),
        item({ id: "copyLinkToHighlight", label: "Copy Link to Highlight", origin: "browser", status: "needs-backend" }),
      ],
      [item({ id: "search", label: "Search for “…”", origin: "browser", status: "built", uses: "open_tab(SEARCH_URL)", note: "Shows the first 24 characters; opens and selects a new tab" })],
      [item({ id: "inspectType", label: "Inspect Typography", origin: "designer", status: "needs-backend", note: "Font family, weight, size, line height, letter spacing; copy as CSS" })],
    ],
  },

  editable: {
    kind: "context",
    trigger: "Right-click a text field on the page",
    scope: "The field's text",
    groups: [
      [item({ id: "undo", label: "Undo", origin: "browser", status: "built", note: "Ezel's menu running WebView2's commands; dimmed when WebView2 says so" }), item({ id: "redo", label: "Redo", origin: "browser", status: "built" })],
      [
        item({ id: "cut", label: "Cut", origin: "browser", status: "built" }),
        item({ id: "copy", label: "Copy", origin: "browser", status: "built" }),
        item({ id: "paste", label: "Paste", origin: "browser", status: "built" }),
        item({ id: "pastePlain", label: "Paste as Plain Text", origin: "browser", status: "built" }),
        item({ id: "selectAll", label: "Select All", origin: "browser", status: "built" }),
      ],
    ],
    notHere: [{ label: "Spelling suggestions", lives: "WebView2 adds them above these" }],
  },

  // ---- Later surfaces ----

  download: {
    kind: "context",
    trigger: "Right-click a download in the downloads list (the list itself: the footer's downloads button)",
    scope: "That download",
    groups: [
      [
        item({ id: "open", label: "Open", origin: "browser", status: "built", when: "completed", uses: "open_download", note: "In the list: click the file name (no right-click menu yet)" }),
        item({ id: "showInFolder", label: "Show in Folder", origin: "browser", status: "built", when: "completed", uses: "show_download_in_folder", note: "In the list: the folder button" }),
        item({ id: "cancel", label: "Cancel", origin: "browser", status: "built", when: "in progress", uses: "cancel_download", note: "In the list: the × button" }),
        item({ id: "copyLink", label: "Copy Download Link", origin: "browser", status: "needs-feature" }),
        item({ id: "retry", label: "Retry", origin: "browser", status: "needs-feature", when: "failed" }),
      ],
      [
        item({ id: "remove", label: "Remove from List", origin: "browser", status: "needs-feature" }),
        item({ id: "delete", label: "Delete File…", origin: "browser", status: "needs-feature", destructive: true }),
      ],
    ],
  },

  titlebar: {
    kind: "context",
    trigger: "Right-click the titlebar strip",
    scope: "The window",
    groups: [
      [
        item({ id: "restore", label: "Restore", origin: "browser", status: "needs-backend", note: "Windows' own system menu, as on native title bars" }),
        item({ id: "minimize", label: "Minimize", origin: "browser", status: "planned" }),
        item({ id: "maximize", label: "Maximize", origin: "browser", status: "planned" }),
      ],
      [item({ id: "close", label: "Close", origin: "browser", status: "planned" })],
    ],
  },
} as const satisfies Record<string, MenuArea>

export type MenuAreaId = keyof typeof MENU_CATALOG
type ItemOf<A extends MenuAreaId> = (typeof MENU_CATALOG)[A]["groups"][number][number]
export type MenuItemId<A extends MenuAreaId> = ItemOf<A>["id"]

/** A catalog item's label, so built menus and this catalog say the same thing. */
export function menuLabel<A extends MenuAreaId>(area: A, id: MenuItemId<A>): string {
  for (const group of MENU_CATALOG[area].groups as readonly (readonly CatalogItem[])[]) {
    const found = group.find((entry) => entry.id === id)
    if (found) return found.label
  }
  throw new Error(`menu catalog: no ${String(id)} in ${area}`)
}
