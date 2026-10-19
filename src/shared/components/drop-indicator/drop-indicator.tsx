import { cn } from "@/lib/utils";

interface DropIndicatorProps {
  /** The edge of the (relative) parent row the line sits on. */
  edge: "top" | "bottom";
  className?: string;
}

/**
 * Zen's tab drop line: 2px, inset 2px each side, filling the 2px gap above or below the parent
 * row. Neutral, not an accent: it marks a place, it isn't a control. Place it in a relative row
 * (SidebarMenuItem is one).
 */
export const DropIndicator = ({ edge, className }: DropIndicatorProps) => (
  <span
    aria-hidden
    className={cn(
      "pointer-events-none absolute inset-x-0.5 z-10 h-0.5 rounded-full bg-sidebar-foreground/40",
      edge === "top" ? "-top-0.5" : "-bottom-0.5",
      className,
    )}
  />
);
