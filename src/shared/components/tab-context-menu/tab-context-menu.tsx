import { Fragment, type ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { Id } from "../../types";

// The tab's right-click menu (docs/design/context-menus.md, "Tab menu"). The widget decides the
// items (it knows where the tab lives and holds the commands); this only draws them.

export type TabMenuItem =
  | {
      label: string;
      onSelect: () => void;
      disabled?: boolean;
      /** Right-aligned detail, e.g. "3 / 8". */
      hint?: string;
    }
  /** A submenu: only for picking a variant (Move Tab ▸, Close Multiple Tabs ▸). */
  | { label: string; items: TabMenuItem[] };

/** Groups of items, drawn with separators between them. Empty groups are skipped. */
export type TabMenu = TabMenuItem[][];

interface TabContextMenuProps {
  tabId: Id;
  /** Builds the menu when it opens, so closed menus cost nothing. */
  menuFor: (tabId: Id) => TabMenu;
  /** The row or cell that opens the menu on right-click. */
  children: ReactNode;
  className?: string;
}

/**
 * Right-clicking a tab opens its menu. It wins over the sidebar's own menu around it: Base UI's
 * trigger stops the event.
 */
export const TabContextMenu = ({ tabId, menuFor, children, className }: TabContextMenuProps) => (
  <ContextMenu>
    <ContextMenuTrigger className={className}>{children}</ContextMenuTrigger>
    <ContextMenuContent className="min-w-48">
      <TabMenuItems menu={menuFor(tabId)} />
    </ContextMenuContent>
  </ContextMenu>
);

function TabMenuItems({ menu }: { menu: TabMenu }) {
  const groups = menu.filter((group) => group.length > 0);
  return groups.map((group, index) => (
    <Fragment key={index}>
      {index > 0 && <ContextMenuSeparator />}
      {group.map((item) => (
        <MenuItem key={item.label} item={item} />
      ))}
    </Fragment>
  ));
}

function MenuItem({ item }: { item: TabMenuItem }) {
  if ("items" in item) {
    return (
      <ContextMenuSub>
        <ContextMenuSubTrigger>{item.label}</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {item.items.map((sub) => (
            <MenuItem key={sub.label} item={sub} />
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
    );
  }
  return (
    <ContextMenuItem disabled={item.disabled} onClick={item.onSelect}>
      {item.label}
      {item.hint && <ContextMenuShortcut className="tracking-normal tabular-nums">{item.hint}</ContextMenuShortcut>}
    </ContextMenuItem>
  );
}
