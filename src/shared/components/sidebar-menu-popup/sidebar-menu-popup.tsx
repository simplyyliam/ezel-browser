import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { cn } from "@/lib/utils";

// The sidebar's right-click menus, kept inside the sidebar card. The website is a native webview
// drawn over everything past the card's right edge, so a menu (or its submenu) must never reach
// there. shadcn's ContextMenuContent can't take a collision boundary (and components/ui stays at
// registry defaults), so these compose the same Base UI parts with the card as the boundary.
// Same classes as shadcn's ContextMenuContent.

const POPUP =
  "z-50 max-h-(--available-height) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95";

/**
 * The card the menus stay in: the sidebar's inner box (docked or peeking). The window while it
 * isn't mounted. 4px inside it, and never wider than the card (244px less that margin; portals
 * don't inherit --sidebar-width).
 */
const sidebarCard = () => document.querySelector('[data-slot="sidebar-inner"]') ?? "clipping-ancestors";
const INSET = 4;
const MAX_WIDTH = "max-w-[236px]";

type PopupProps = ContextMenuPrimitive.Popup.Props;

/**
 * A right-click menu at the pointer: to its right, shifted left as far as it must to end inside
 * the card (the side axis shifts rather than flips: a 190px menu doesn't fit on either side of a
 * pointer in the middle of a 244px card).
 */
export function SidebarMenuPopup({ className, ...props }: PopupProps) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align="start"
        alignOffset={4}
        side="right"
        sideOffset={0}
        collisionBoundary={sidebarCard()}
        collisionPadding={INSET}
        collisionAvoidance={{ side: "shift", align: "shift", fallbackAxisSide: "none" }}
      >
        <ContextMenuPrimitive.Popup data-slot="context-menu-content" className={cn(POPUP, MAX_WIDTH, className)} {...props} />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

/**
 * A submenu: beside its item where the card has room (right, else left), otherwise below it, so
 * it never covers the item it came from.
 */
export function SidebarMenuSubPopup({ className, ...props }: PopupProps) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align="start"
        alignOffset={-4}
        side="right"
        sideOffset={0}
        collisionBoundary={sidebarCard()}
        collisionPadding={INSET}
        collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "end" }}
      >
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-sub-content"
          className={cn(POPUP, MAX_WIDTH, "shadow-lg", className)}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}
