import { Fragment, type ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { SidebarMenuPopup, SidebarMenuSubPopup } from "../sidebar-menu-popup/sidebar-menu-popup";
import type { Id } from "../../types";

// Context menus built from data: the widget decides the items (it knows where things live and
// holds the commands), these components only draw them. What goes in which menu:
// shared/menus/catalog.ts.

export type MenuEntry =
  | {
      label: string;
      onSelect: () => void;
      /** Right-aligned detail that explains availability, e.g. "3 / 8". Never a shortcut. */
      hint?: string;
      /** Last in the menu, in the destructive colour (HIG context-menus.md). */
      destructive?: boolean;
    }
  /** A submenu, one level: Move Tab ▸, Close Multiple Tabs ▸. */
  | { label: string; items: MenuEntry[] };

/**
 * Groups of entries, drawn with separators between them. Items that don't apply are left out by
 * whoever builds the menu (hidden, not dimmed); empty groups and submenus are skipped.
 */
export type MenuGroups = MenuEntry[][];

/** The entries of an open context menu. */
export function ContextMenuEntries({ groups }: { groups: MenuGroups }) {
  const shown = groups
    .map((group) => group.filter((entry) => !("items" in entry) || entry.items.length > 0))
    .filter((group) => group.length > 0);
  return shown.map((group, index) => (
    <Fragment key={index}>
      {index > 0 && <ContextMenuSeparator />}
      {/* Labels can repeat (two folders called "New Folder"), so the place keys them too. */}
      {group.map((entry, i) => (
        <Entry key={`${i}-${entry.label}`} entry={entry} />
      ))}
    </Fragment>
  ));
}

function Entry({ entry }: { entry: MenuEntry }) {
  if ("items" in entry) {
    return (
      <ContextMenuSub>
        <ContextMenuSubTrigger>{entry.label}</ContextMenuSubTrigger>
        <SidebarMenuSubPopup>
          {entry.items.map((sub, i) => (
            <Entry key={`${i}-${sub.label}`} entry={sub} />
          ))}
        </SidebarMenuSubPopup>
      </ContextMenuSub>
    );
  }
  return (
    <ContextMenuItem variant={entry.destructive ? "destructive" : "default"} onClick={entry.onSelect}>
      {entry.label}
      {entry.hint && <ContextMenuShortcut className="tracking-normal tabular-nums">{entry.hint}</ContextMenuShortcut>}
    </ContextMenuItem>
  );
}

interface TabContextMenuProps {
  tabId: Id;
  /** Builds the menu when it opens, so closed menus cost nothing. */
  menuFor: (tabId: Id) => MenuGroups;
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
    <SidebarMenuPopup className="min-w-48">
      <ContextMenuEntries groups={menuFor(tabId)} />
    </SidebarMenuPopup>
  </ContextMenu>
);
