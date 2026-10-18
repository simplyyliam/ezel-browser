# Context menus

What we learned from how Zen does menus, and how Ezel applies it. Ezel isn't a Zen clone: take the
structure and behaviour, pick items that fit Ezel's features.
(Studied 2026-10-18: zen-browser/desktop `zen-panels/popups.inc`, `ZenUIManager.mjs`, `ZenCompactMode.mjs`, `ZenFolders.mjs`, `ZenPinnedTabManager.mjs`.)

## Which areas get a menu
One menu per kind of thing, scoped to that thing. The closest target wins: right-clicking a tab shows the tab's menu, not the sidebar's.

| Area | Scope of its actions | Ezel |
|---|---|---|
| Sidebar background | The sidebar itself and creating things in it: layout toggles, new tab/folder/space, theme | built (`features/app-sidebar/context-menu`) |
| Tab row | That tab: move to folder, add to/remove from Swatches, rename/change icon, pin, duplicate, close | with real tabs |
| Folder row | That folder: rename, change icon, new subfolder, unload, move to another space, unpack/delete | with real folders |
| Space (switcher) | That space: rename, change icon, theme, unload, delete; manage/create spaces | with real spaces |
| Swatch | That swatch's tab: open, replace with current, edit URL, remove | with real tabs |
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
