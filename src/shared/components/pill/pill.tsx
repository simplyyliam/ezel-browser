import type { ComponentProps } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Ezel's small floating pill, the toast's (`showToast`); for any later note of the same kind. A
 * motion element, so the toast can animate it; without motion props it's still. Over the page it must be cut out
 * (`useContentCutout`, no inflate). Its outline is drawn inside its edge: outside it, the outline
 * would sit in the hole on Ezel's dark background (a dark, stepped rim over a light page) instead
 * of on the pill's own grey, as it does over the sidebar.
 */
export function Pill({ className, ...props }: ComponentProps<typeof motion.div>) {
  return (
    <motion.div
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-full bg-popover px-2.5 py-1 text-xs text-popover-foreground inset-ring inset-ring-foreground/10",
        className,
      )}
      {...props}
    />
  );
}
