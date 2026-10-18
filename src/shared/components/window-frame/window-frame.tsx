import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

interface WindowFrameProps extends HTMLAttributes<HTMLDivElement> {
  titlebar?: ReactNode;
}

export const WindowFrame = ({
  children,
  titlebar,
  className,
  ...props
}: WindowFrameProps) => {
  return (
    <div
      className={cn("relative flex h-full w-full flex-col p-1 overflow-hidden", className)}
      {...props}
    >
      {titlebar}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-frame">
        {children}
      </div>
    </div>
  );
};
