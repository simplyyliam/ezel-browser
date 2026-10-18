import { cn } from "@/lib/utils";
import type { Tab } from "../../types";
import { Favicon } from "../favicon/favicon";

interface TabRowProps {
  tab: Tab;
  active?: boolean;
  onSelect?: () => void;
  className?: string;
}

/** A sidebar tab row: favicon + title. Used by folders and temp tabs. */
export const TabRow = ({ tab, active = false, onSelect, className }: TabRowProps) => (
  <button
    type="button"
    data-active={active || undefined}
    aria-current={active ? "page" : undefined}
    onClick={onSelect}
    className={cn(
      "flex h-7 w-full min-w-0 items-center gap-1.5 rounded-[7.5px] px-1.5 text-left text-[10.5px] text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-foreground/[0.03] focus-visible:ring-2 focus-visible:ring-sidebar-ring data-active:bg-sidebar-foreground/5",
      className,
    )}
  >
    <Favicon src={tab.favicon} />
    <span className="truncate">{tab.title}</span>
  </button>
);
