import { SidebarMenuItem, SidebarMenuSubItem } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { DROP_ROW, useTabDraggable, type TabDragSource } from "../../tab-dnd";
import type { Id, Tab } from "../../types";
import { DropIndicator } from "../drop-indicator/drop-indicator";
import { TabContextMenu, type MenuGroups } from "../tab-context-menu/tab-context-menu";
import { TabRow } from "./tab-row";

/** What every tab row in the sidebar's lists needs from the widget, passed through features as one prop. */
export interface TabRowActions {
  activeTabId: Id | null;
  onSelect: (tabId: Id) => void;
  /** Temp tabs are removed; pinned tabs only unload. */
  onClose: (tabId: Id) => void;
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
  /** In a folder: a sub item, and not a list row of its own (the folder is). */
  sub?: boolean;
}

/** A TabRow in its menu item that can be dragged and right-clicked (docs/design/drag-and-drop.md). */
export const DraggableTabItem = ({ tab, source, actions, indicator = null, sub = false }: DraggableTabItemProps) => {
  const { setNodeRef, listeners } = useTabDraggable(tab, source);
  const Item = sub ? SidebarMenuSubItem : SidebarMenuItem;
  const editValue = actions.editing?.tabId === tab.id ? actions.editing.value : null;

  return (
    <Item
      ref={setNodeRef}
      // An address being typed isn't dragged.
      {...(editValue === null ? listeners : {})}
      {...(sub ? {} : DROP_ROW)}
      className={cn(actions.draggedTabId === tab.id && "opacity-40")}
    >
      {/* `contents`: the trigger adds no box, so the row and its close button stay siblings (peer hover). */}
      <TabContextMenu tabId={tab.id} menuFor={actions.menuFor} className="contents">
        <TabRow
          tab={tab}
          active={tab.id === actions.activeTabId}
          onSelect={() => actions.onSelect(tab.id)}
          onClose={() => actions.onClose(tab.id)}
          editValue={editValue}
          onEdit={() => actions.onEdit(tab.id)}
          onEditDone={actions.onEditDone}
        />
      </TabContextMenu>
      {indicator && <DropIndicator edge={indicator} />}
    </Item>
  );
};
