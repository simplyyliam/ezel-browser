import { memo } from "react";
import { SidebarMenuItem, SidebarMenuSubItem } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { DROP_ROW, FOLDER_TAB_ROW, useTabDraggable, type TabDragSource } from "../../tab-dnd";
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
 */
export const DraggableTabItem = memo(function DraggableTabItem({ tab, source, actions, indicator = null, sub = false }: DraggableTabItemProps) {
  const { setNodeRef, listeners } = useTabDraggable(tab, source);
  const Item = sub ? SidebarMenuSubItem : SidebarMenuItem;
  const editValue = actions.editing?.tabId === tab.id ? actions.editing.value : null;

  return (
    <Item
      ref={setNodeRef}
      // An address being typed isn't dragged.
      {...(editValue === null ? listeners : {})}
      {...(sub ? FOLDER_TAB_ROW : DROP_ROW)}
      // `group/tab`: this tab's own hover (its speaker and close buttons), even inside a folder.
      className={cn("group/tab", actions.draggedTabId === tab.id && "opacity-40")}
    >
      {/* `contents`: the trigger adds no box, so the row and its close button stay siblings (peer hover). */}
      <TabContextMenu tabId={tab.id} menuFor={actions.menuFor} className="contents">
        <TabRow
          tab={tab}
          active={tab.id === actions.activeTabId}
          onSelect={() => actions.onSelect(tab.id)}
          onClose={() => actions.onClose(tab.id)}
          onToggleMute={() => actions.onSetMuted(tab.id, !tab.isMuted)}
          editValue={editValue}
          onEdit={() => actions.onEdit(tab.id)}
          onEditDone={actions.onEditDone}
        />
      </TabContextMenu>
      {indicator && <DropIndicator edge={indicator} />}
    </Item>
  );
}, sameRow);

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
