import { SidebarMenuButton } from "@/components/ui/sidebar";
import type { Tab } from "../../types";
import { Favicon } from "../favicon/favicon";

interface TabRowProps {
  tab: Tab;
  active?: boolean;
  onSelect?: () => void;
  className?: string;
}

/** A sidebar tab row: favicon + title. Place it in a SidebarMenuItem or SidebarMenuSubItem. Used by folders and temp tabs. */
export const TabRow = ({ tab, active = false, onSelect, className }: TabRowProps) => (
  <SidebarMenuButton
    isActive={active}
    aria-current={active ? "page" : undefined}
    onClick={onSelect}
    className={className}
  >
    <Favicon src={tab.favicon} />
    <span>{tab.title}</span>
  </SidebarMenuButton>
);
