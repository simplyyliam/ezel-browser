import { useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface FaviconProps {
  /** Image URL; null (or a failed load) shows a faint globe, the generic site. */
  src: string | null;
  /**
   * The tab is unloaded: the icon rests dimmed and greyscale, and its colour wakes up while the
   * element it sits in (its row, swatch or button) is hovered or keyboard-focused (index.css).
   */
  sleepy?: boolean;
  className?: string;
}

/**
 * Icons this window has already shown, so a row remounting (a space switch, the palette opening)
 * shows its icon at once; only an icon arriving for the first time fades in. Capped: just a hint.
 */
const seen = new Set<string>();
const MAX_SEEN = 500;

/**
 * A fully rounded favicon, 16px unless sized through className. Until the image arrives, the
 * placeholder's soft dot holds its place; an icon seen for the first time then fades in over it,
 * so rows never pop.
 */
export const Favicon = ({ src, sleepy = false, className }: FaviconProps) => {
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ src: string; fresh: boolean } | null>(null);

  if (!src || failed === src) {
    // A site without an icon: a faint globe in the icon's place, no filled disc (it read as a
    // hole in the row). Inherits the text colour, so it sits right on any surface.
    return (
      <span
        aria-hidden
        data-slot="favicon"
        data-sleepy={sleepy || undefined}
        className={cn("grid size-4 shrink-0 place-items-center rounded-full", className)}
      >
        <Globe strokeWidth={1.75} className="size-[85%]! opacity-45" />
      </span>
    );
  }
  const arrived = loaded?.src === src;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      data-slot="favicon"
      data-sleepy={sleepy || undefined}
      onLoad={() => {
        const fresh = !seen.has(src);
        if (seen.size >= MAX_SEEN) seen.clear();
        seen.add(src);
        setLoaded({ src, fresh });
      }}
      onError={() => setFailed(src)}
      className={cn(
        "size-4 shrink-0 rounded-full object-cover",
        // The dot until a new image paints; a known one paints at once, so it needs none.
        !arrived && !seen.has(src) && "bg-sidebar-foreground/15",
        arrived && loaded.fresh && "animate-favicon-in",
        className,
      )}
    />
  );
};
