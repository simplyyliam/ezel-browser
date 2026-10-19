import { SidebarMenuItem, SidebarMenuSubItem } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { DROP_ROW, useTabDraggable, type TabDragSource } from "../../tab-dnd";
import type { Tab } from "../../types";
import { DropIndicator } from "../drop-indicator/drop-indicator";
import { TabRow } from "./tab-row";

interface DraggableTabItemProps {
  tab: Tab;
  source: TabDragSource;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  /** Being dragged (or just dropped, until the backend moves it): dimmed in place. */
  isDragged: boolean;
  /** Where a drop line shows on this row, if any. */
  indicator?: "top" | "bottom" | null;
  /** In a folder: a sub item, and not a list row of its own (the folder is). */
  sub?: boolean;
}

/** A TabRow in its menu item that can be dragged (docs/design/drag-and-drop.md). */
export const DraggableTabItem = ({
  tab,
  source,
  active,
  onSelect,
  onClose,
  isDragged,
  indicator = null,
  sub = false,
}: DraggableTabItemProps) => {
  const { setNodeRef, listeners } = useTabDraggable(tab, source);
  const Item = sub ? SidebarMenuSubItem : SidebarMenuItem;

  return (
    <Item
      ref={setNodeRef}
      {...listeners}
      {...(sub ? {} : DROP_ROW)}
      className={cn(isDragged && "opacity-40")}
    >
      <TabRow tab={tab} active={active} onSelect={onSelect} onClose={onClose} />
      {indicator && <DropIndicator edge={indicator} />}
    </Item>
  );
};
