# Context menus

What we learned from how Zen does menus, and how Ezel applies it. Ezel isn't a Zen clone: take the
structure and behaviour, pick items that fit Ezel's features.
(Studied 2026-10-18: zen-browser/desktop `zen-panels/popups.inc`, `ZenUIManager.mjs`, `ZenCompactMode.mjs`, `ZenFolders.mjs`, `ZenPinnedTabManager.mjs`.)

## Which areas get a menu
One menu per kind of thing, scoped to that thing. The closest target wins: right-clicking a tab shows the tab's menu, not the sidebar's.

| Area | Scope of its actions | Ezel |
|---|---|---|
| Sidebar background | The sidebar itself and creating things in it: layout toggles, new tab/folder/space, theme | built (`features/app-sidebar/context-menu`) |
| Tab row | That tab: new tab below, duplicate, reload, copy link, change URL, Swatches, pin, unload, move, close | built (see Tab menu) |
| Folder row | That folder: rename, new tab in it, collapse/expand, unload, move to another space, unpack/delete | built (v0.3.0, `features/app-sidebar/folders`) |
| Space (switcher) | That space: rename, change icon, theme, unload, delete; manage/create spaces | with real spaces |
| Swatch | That swatch's tab: the tab menu, with "Remove from Swatches" and no "Change URL…" | built (see Tab menu) |
| "+" button | Create: space, folder, tab | bottom-actions dropdown |

## How menus are put together
- **Order**: state toggles first (with a checkmark), then create actions, then actions on the selection, then layout/appearance last. Group with separators, at most about 4 per group.
- **Context-aware items**: hide items that don't apply (e.g. "Remove from Swatches" only on a swatch tab) instead of showing them disabled, unless the user needs to see the option exists.
- **Submenus** only for picking a destination or a variant (move to folder ▸, change space ▸). Never more than one level.
- Labels: verb first, sentence case, "…" when the item opens a dialog or needs more input.

## Behaviour
Zen keeps the sidebar open while a popup opened from it is showing (`has-popup-menu`, independent of hover), and Firefox closes popups on any click outside them. Ezel's equivalent:
- A popup opened from the peeking sidebar keeps the sidebar out until the popup closes, whatever the pointer or focus does (`use-sidebar-peek.ts`).
- Click inside the sidebar: only the popup closes. Click on the page: the popup closes, then the sidebar.
- The page is a separate native webview, so its clicks never reach the UI. The UI webview losing focus counts as an outside press (`useDismissPopupsOnBlur` in `shared/outside-press.ts`, mounted in `AppLayout`). This works for every popup, not just menus.
- Popups that extend over the page are cut out of the webview (`usePopupCutouts`) so they stay visible.

## Tab menu (2026-10-19)
Zen's tab menu is Firefox's tab menu plus Zen's own items (Move to Folder, Add Split View, Add to Essentials, Change Label/Icon) and extension items (routes, auto discard). Ezel takes only what any browser has, plus its own Swatches and address editing. Zen's additions aren't copied.

| Group | Items | Where |
|---|---|---|
| Open | New Tab Below, Duplicate Tab | all; the new tab goes right below a temp tab, else on top of the temp tabs. New Tab Below opens its name field empty |
| Page | Reload Tab, Mute Tab / Unmute Tab, Copy Link | Reload only on the shown, loaded tab (`reload` acts on the shown tab); Mute while it plays sound, Unmute while muted (also on swatches) |
| Keep | Change URL…, Add to Swatches (`n / 8`, disabled when full) / Remove from Swatches, Pin Tab / Unpin Tab | Change URL… on list rows only (swatches have no name field); Remove → top of the active space's temp tabs |
| Arrange | Unload Tab, Move Tab ▸ Move to Start / Move to End | Unload only when loaded; Move on temp and top-level pinned tabs |
| Close | Close Tab, Close Multiple Tabs ▸ Close Tabs Above / Below / Other Tabs | the submenu on temp tabs only |

Labels in Title Case, like the sidebar menu and Firefox/Zen. Reopen Closed Tab lives in the sidebar menu (after New Tab, shown while there's a closed tab), not here: it brings back another tab, not the one right-clicked. Left out until the backend has it: Reload for a background tab. Folders (v0.3.0): New Folder with Tab (the folder takes the tab's place, its name opens as a field) and Move to Folder ▸ (the space's other folders) sit with the other placing items. Left out until the feature exists: Bookmark, Share, Move to New Window.
