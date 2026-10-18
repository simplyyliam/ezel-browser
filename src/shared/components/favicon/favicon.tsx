import { useState } from "react";
import { cn } from "@/lib/utils";

interface FaviconProps {
  /** Image URL; null (or a failed load) shows the grey-circle placeholder. */
  src: string | null;
  className?: string;
}

/** A fully rounded favicon, 16px unless sized through className. */
export const Favicon = ({ src, className }: FaviconProps) => {
  const [failed, setFailed] = useState<string | null>(null);

  if (!src || failed === src) {
    return <span aria-hidden className={cn("size-4 shrink-0 rounded-full bg-sidebar-foreground/15", className)} />;
  }
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      onError={() => setFailed(src)}
      className={cn("size-4 shrink-0 rounded-full object-cover", className)}
    />
  );
};
