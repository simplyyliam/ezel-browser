import { cn } from "@/lib/utils";

interface DropIndicatorProps {
  /** The edge of the (relative) parent row the line sits on. */
  edge: "top" | "bottom";
  className?: string;
}

/**
 * Zen's tab drop line: 2px, inset 2px each side, centred on the parent row's edge. Place it in a
 * relative row (SidebarMenuItem is one).
 */
export const DropIndicator = ({ edge, className }: DropIndicatorProps) => (
  <span
    aria-hidden
    className={cn(
      "pointer-events-none absolute inset-x-0.5 z-10 h-0.5 rounded-full bg-sidebar-primary",
      edge === "top" ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2",
      className,
    )}
  />
);
