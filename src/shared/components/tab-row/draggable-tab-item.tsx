import { memo } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { SidebarMenuItem, SidebarMenuSubItem } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { DURATION, EASE_OUT, ENTER, EXIT, INSTANT, SPRING } from "../../motion";
import { DROP_ROW, FOLDER_TAB_ROW, useTabDraggable, type TabDragSource } from "../../tab-dnd";
import { isTabOpen } from "../../tabs-store";
import type { Id, Tab } from "../../types";
import { DropIndicator } from "../drop-indicator/drop-indicator";
import { TabContextMenu, type MenuGroups } from "../tab-context-menu/tab-context-menu";
import { TabRow } from "./tab-row";

/**
 * What every tab row in the sidebar's lists needs from the widget, passed through features as one prop.
 * The callbacks must keep their identity across renders (read the latest state when called): rows
 * re-render only when their own tab or state changes (docs/perf/many-tabs.md).
 */
export interface TabRowActions {
  activeTabId: Id | null;
  onSelect: (tabId: Id) => void;
  /** Temp tabs are removed; pinned tabs only unload. */
  onClose: (tabId: Id) => void;
  /** The row's speaker button (shown while the tab plays sound or is muted). */
  onSetMuted: (tabId: Id, muted: boolean) => void;
  /** The tab's right-click menu. */
  menuFor: (tabId: Id) => MenuGroups;
  /** The tab whose name is being edited as an address, and the text it starts with. */
  editing: { tabId: Id; value: string } | null;
  onEdit: (tabId: Id) => void;
  onEditDone: (input: string | null) => void;
  /** The tab being dragged (or just dropped, until the backend moves it): dimmed in place. */
  draggedTabId: Id | null;
}

interface DraggableTabItemProps {
  tab: Tab;
  source: TabDragSource;
  actions: TabRowActions;
  /** Where a drop line shows on this row, if any. */
  indicator?: "top" | "bottom" | null;
  /** In a folder: a sub item, a row of the folder's list (not of the space's: the folder is one). */
  sub?: boolean;
}

/**
 * A TabRow in its menu item that can be dragged and right-clicked (docs/design/drag-and-drop.md).
 * Memoised on what this row shows: with 130 tabs, one tab's change used to re-render every row.
 *
 * Inside its list's AnimatePresence (`initial={false}`: rows already there when a list mounts,
 * at launch or on a space switch, just show), a new row pops in at a scale while its space
 * opens, and a closed one does the reverse while the rows below glide up. A row whose tab moved elsewhere (a drop,
 * Add to Swatches) leaves at once: its new place shows it. Reduced motion: a fade only.
 */
export const DraggableTabItem = memo(function DraggableTabItem({ tab, source, actions, indicator = null, sub = false }: DraggableTabItemProps) {
  const { setNodeRef, listeners } = useTabDraggable(tab, source);
  const Item = sub ? SidebarMenuSubItem : SidebarMenuItem;
  const editValue = actions.editing?.tabId === tab.id ? actions.editing.value : null;
  const reduceMotion = useReducedMotion();

  return (
    <Item
      ref={setNodeRef}
      // An address being typed isn't dragged.
      {...(editValue === null ? listeners : {})}
      {...(sub ? FOLDER_TAB_ROW : DROP_ROW)}
      // `group/tab`: this tab's own hover (its speaker and close buttons), even inside a folder.
      className={cn("group/tab", actions.draggedTabId === tab.id && "opacity-40")}
    >
      {/* Grows and collapses. `relative`: the row's buttons are placed (and clipped) with it.
          Clipped with a 2px margin, so the keyboard focus ring still shows at rest. */}
      <motion.div
        className="relative overflow-clip [overflow-clip-margin:2px]"
        variants={reduceMotion ? FADE_ROW : GROW_ROW}
        custom={tab.id}
        initial="hidden"
        animate="shown"
        exit="leaving"
      >
        {/* `contents`: the trigger adds no box, so the row and its close button stay siblings (peer hover). */}
        <TabContextMenu tabId={tab.id} menuFor={actions.menuFor} className="contents">
          <TabRow
            tab={tab}
            active={tab.id === actions.activeTabId}
            onSelect={() => actions.onSelect(tab.id)}
            onClose={() => actions.onClose(tab.id)}
          // A pinned tab's close only unloads it; once it rests, the same button removes it.
          closeRemoves={source !== "temp" && !tab.isLoaded}
            onToggleMute={() => actions.onSetMuted(tab.id, !tab.isMuted)}
            editValue={editValue}
            onEdit={() => actions.onEdit(tab.id)}
            onEditDone={actions.onEditDone}
          />
        </TabContextMenu>
      </motion.div>
      {indicator && <DropIndicator edge={indicator} />}
    </Item>
  );
}, sameRow);

/** How small a row starts when it pops in, and ends when it closes. */
const POP_SCALE = 0.9;

/**
 * A row joining or leaving its list. In: its space opens while the row pops in from 90% on a
 * spring (it answers the click) and fades up. Out, the reverse: the row shrinks back to 90% and
 * fades, and its space closes after it while the rows below glide up.
 */
const GROW_ROW: Variants = {
  hidden: { height: 0, opacity: 0, scale: POP_SCALE },
  shown: {
    height: "auto",
    opacity: 1,
    scale: 1,
    transition: { height: { duration: DURATION.base, ease: EASE_OUT }, opacity: ENTER, scale: SPRING },
  },
  leaving: (id: Id) =>
    isTabOpen(id)
      ? { height: 0, opacity: 0, transition: INSTANT }
      : {
          height: 0,
          opacity: 0,
          scale: POP_SCALE,
          pointerEvents: "none",
          transition: {
            opacity: { duration: DURATION.base, ease: EASE_OUT },
            scale: { duration: DURATION.base, ease: EASE_OUT },
            height: { ...EXIT, delay: DURATION.fast / 2 },
          },
        },
};

const FADE_ROW: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: DURATION.base } },
  leaving: (id: Id) => ({ opacity: 0, pointerEvents: "none", transition: isTabOpen(id) ? INSTANT : { duration: DURATION.base } }),
};

/** The same row on screen: its tab, place and drop line, its own slice of the shared state, the same callbacks. */
function sameRow(a: DraggableTabItemProps, b: DraggableTabItemProps) {
  const id = a.tab.id;
  const x = a.actions;
  const y = b.actions;
  return (
    a.tab === b.tab &&
    a.source === b.source &&
    (a.indicator ?? null) === (b.indicator ?? null) &&
    a.sub === b.sub &&
    (x.activeTabId === id) === (y.activeTabId === id) &&
    (x.editing?.tabId === id ? x.editing.value : null) === (y.editing?.tabId === id ? y.editing.value : null) &&
    (x.draggedTabId === id) === (y.draggedTabId === id) &&
    x.onSelect === y.onSelect &&
    x.onClose === y.onClose &&
    x.onSetMuted === y.onSetMuted &&
    x.menuFor === y.menuFor &&
    x.onEdit === y.onEdit &&
    x.onEditDone === y.onEditDone
  );
}
