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
      className={cn("relative flex h-screen flex-col overflow-hidden", className)}
      {...props}
    >
      {titlebar}
      <div className="min-h-0 flex-1">
        {children}
      </div>
    </div>
  );
};
