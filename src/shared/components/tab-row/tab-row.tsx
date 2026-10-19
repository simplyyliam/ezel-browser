import { X } from "lucide-react";
import { SidebarMenuAction, SidebarMenuButton } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { Tab } from "../../types";
import { Favicon } from "../favicon/favicon";

interface TabRowProps {
  tab: Tab;
  active?: boolean;
  onSelect?: () => void;
  /** Shows a close button while the row is hovered or focused. */
  onClose?: () => void;
  className?: string;
}

/** The page title, else the URL's host, else "New Tab". */
export function tabLabel(tab: Tab): string {
  if (tab.title) return tab.title;
  try {
    return new URL(tab.url).host || "New Tab";
  } catch {
    return tab.url || "New Tab";
  }
}

/**
 * A sidebar tab row: favicon + title, dimmed while the tab is unloaded (no webview; selecting it
 * loads it). Place it in a SidebarMenuItem or SidebarMenuSubItem. Used by folders and temp tabs.
 */
export const TabRow = ({ tab, active = false, onSelect, onClose, className }: TabRowProps) => {
  const label = tabLabel(tab);
  return (
    <>
      <SidebarMenuButton
        isActive={active}
        aria-current={active ? "page" : undefined}
        title={label}
        onClick={onSelect}
        className={cn(!tab.isLoaded && !active && "text-sidebar-foreground/45 [&_img]:opacity-50", className)}
      >
        <Favicon src={tab.favicon} />
        <span>{label}</span>
      </SidebarMenuButton>
      {onClose && (
        // Hover is tracked on the row itself (peer), not the menu item: in a folder the item is the
        // whole folder, so its group-hover would reveal every tab's button at once.
        <SidebarMenuAction
          aria-label={`Close ${label}`}
          onClick={onClose}
          className="opacity-0 peer-hover/menu-button:opacity-100 hover:opacity-100 focus-visible:opacity-100 [&>svg]:size-3.5"
        >
          <X aria-hidden />
        </SidebarMenuAction>
      )}
    </>
  );
};
