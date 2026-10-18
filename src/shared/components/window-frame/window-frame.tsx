import { cn } from "@/lib/utils";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { useWindowRadius } from "../../window-radius";

/** Matches the frame's `p-1`: the inner radius is the window radius minus this gap. */
const FRAME_PADDING = 4;

interface WindowFrameProps extends HTMLAttributes<HTMLDivElement> {
  /** Positions itself (absolute) against the frame's padding box, so it can cover the padding. */
  titlebar?: ReactNode;
}

export const WindowFrame = ({
  children,
  titlebar,
  className,
  style,
  ...props
}: WindowFrameProps) => {
  const { radius } = useWindowRadius();
  // Unknown OS radius: keep the CSS default for --radius-frame.
  const frameStyle =
    radius === null
      ? style
      : ({ ...style, "--radius-frame": `${Math.max(radius - FRAME_PADDING, 0)}px` } as CSSProperties);

  return (
    <div
      className={cn("relative flex h-full w-full flex-col p-1 overflow-hidden", className)}
      style={frameStyle}
      {...props}
    >
      {titlebar}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-frame">
        {children}
      </div>
    </div>
  );
};
