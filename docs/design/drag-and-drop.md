# Tab drag and drop

How Zen and Arc move tabs between Essentials/Favorites (our **Swatches**), pinned tabs and temporary
tabs by dragging, and how Ezel reproduces the behaviour. Behaviour only: Zen's code is Firefox's
HTML5 drag session and can't be ported.
(Studied 2026-10-19: zen-browser/desktop `src/zen/drag-and-drop/ZenDragAndDrop.js`,
`src/zen/tabs/ZenPinnedTabManager.mjs`, `prefs/zen/{zen,workspaces,folders}.yaml`. Arc has no public
source: its help centre and guides only say where to drop, so anything marked *Arc (guess)* is from
memory of using it, not from docs.)

## What we found
**Drops**
- Onto Swatches: the tab becomes a swatch and leaves its list. Zen (`addToEssentials`), Arc (docs: "drag a tab above the Space title").
- Swatch onto the pinned list: it stops being a swatch and is pinned in the active space. Zen (`removeEssentials` + pin), Arc (docs).
- Onto the temporary list: the tab is unpinned (a swatch leaves the grid). Zen (`unpinTab`), Arc (docs: "drag below the horizontal line").
- Within a list: reorder. Both.
- Onto a folder row: the middle of the row drops into the folder and highlights it. The top and bottom 20% drop above or below it (`zen.tabs.folder-dragover-threshold-percent = 20`). Zen. Not built in Ezel yet.

**Insertion indicator**
- Lists: one shared horizontal line spans the hovered row, inset 2px each side. It sits on the row's top edge when the drop goes before the row and on its bottom edge when it goes after. Rows don't move while dragging. Zen.
- After the drop, the rows in between slide into place: 100ms ease-out, skipped under reduced motion. Zen.
- Below the last row (empty space): the line goes under the last tab. Zen.
- Arc (guess): no line; neighbours slide apart live.
- Swatch grid: no line. The dragged swatch's cell goes invisible and the other cells shift live to open a gap. A tab from outside gets an extra placeholder cell. Zen.
- The drag image turns into the swatch's tile shape over the grid and back into a row over the lists. Zen (`#makeDragImageEssential` / `NonEssential`).

**Full or occupied**
- Full grid (Zen max 12, `zen.tabs.essentials.max`): a tab from outside gets no gap or placeholder, and the drop does nothing. Swatches can still be reordered. Zen.
- Arc: the docs say up to 12 Favorites (some guides say 8). What happens past the limit isn't documented; refusing is a guess.
- Occupied slot: neither browser has fixed slots. The grid is a list, so a drop inserts and the rest reflow. Zen; Arc (guess).

**Cancelled drag**
- Escape, or releasing over nothing: nothing moves, shifted rows return and the hidden swatch reappears. Zen (Firefox). Only macOS slides the image back (OS behaviour).
- Releasing outside the window tears the tab into a new window. Zen, Arc (guess). Not for Ezel.

**Hover and auto-open**
- Dragging over a space's icon switches to that space immediately. Hovering within 20px of the sidebar's left or right edge for 500ms switches to the previous or next space (`dnd-switch-padding`, `dnd-switch-space-delay`). Neither happens while dragging a swatch (swatches are global) or over the swatch grid. Zen.
- Arc (guess): hovering a space's icon at the bottom switches to it.
- Compact mode keeps the sidebar out for the whole drag (`_isTabBeingDragged`). Zen.
- Moving the indicator plays macOS haptic feedback (the first move is skipped). Zen. Not for Ezel.

## Ezel
- **dnd-kit, not HTML5 drag**: Tauri's drag-drop handler on Windows swallows HTML5 drag events. `DndContext` lives in `widgets/app-sidebar` (`use-tab-drag.ts`). Features only register draggables/droppables (`shared/tab-dnd.ts`) and draw what the widget tells them.
- **No optimistic state**: a drop calls `commands.moveTab`, and the view moves when `tabs-changed` arrives. Until then the dragged tab stays hidden, so it doesn't flash back to where it came from.
- **Lists** (pinned top level, temp): Zen's line. 2px, inset 2px, centred on the gap between rows; before or after by the hovered row's midpoint. A whole folder (header and open tabs) counts as one row: tabs go above or below it, never into it (TODO). Tabs inside a folder can be dragged out. A drop that wouldn't change anything shows no line.
- **Swatches are 8 fixed slots** (backend: `move_tab` to an occupied slot swaps). The target slot shows a ring. If it's occupied, its tab dims: it will swap to where the dragged tab came from. A swatch dragged from another swatch leaves its cell empty while dragging (Zen hides it). A full grid accepts drops as swaps; Zen's refusal only exists because its grid can grow.
- **Drag preview**: our own fixed element that follows the pointer. A row is locked to the sidebar's width; a swatch keeps its tile. It turns into the tile over the grid and back into a row over the lists (Zen). Width and height change over 150ms ease-in-out, instantly under reduced motion.
- **Leaving the sidebar cancels.** The native webview is drawn over everything past the sidebar and eats pointer events. A pointer move outside the sidebar card cancels the drag, and so does a move with no button down (released where the UI couldn't hear it). When the document stops getting pointer events, the real cursor position (Tauri) decides. Focus doesn't count: a tab webview created mid-drag (a space switch loading its tab) takes focus and briefly covers the card.
- **Cancel** (Escape, leaving the sidebar, releasing over nothing): the preview slides back to its source over 150ms ease-in-out, or disappears at once under reduced motion or when the source is no longer on screen.
- **Spaces**: hovering another space's pill for 500ms switches to it (Zen switches immediately, but our pills sit between the swatches and the lists, so passing over them must not switch). Not while dragging a swatch. Edge switching is left out: the sidebar edge is where the drag cancels.
- **Peek**: the pointer never leaves the sidebar during a drag, so hover keeps the peeking card out (Zen's `_isTabBeingDragged`).
- Pointer only. There's no keyboard dragging; the keyboard route will be the tab context menu's "Move to".
