import type { MouseEvent } from "react";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { cn } from "@/lib/utils";
import { dismissPopups } from "../../outside-press";

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
const sidebarCard = () => {
  // Only a card that's on screen: measuring one with no size (a sidebar being rebuilt) gave the
  // menu no room at all, and it opened as an empty sliver.
  const card = [...document.querySelectorAll('[data-slot="sidebar-inner"]')].find((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  return card ?? "clipping-ancestors";
};
const INSET = 4;
const MAX_WIDTH = "max-w-[236px]";

type PopupProps = ContextMenuPrimitive.Popup.Props;

/**
 * Every sidebar context menu trigger's `onContextMenu`: a right-click opens the menu of what's
 * under the pointer, even while another menu is open.
 *
 * React events bubble through portals to the component that rendered them. While a menu is open,
 * Base UI lays an invisible backdrop over the window, inside that menu's portal: a right-click on
 * another tab hit the backdrop and bubbled to the trigger that owned the open menu (or the
 * sidebar's, around everything), which reopened *that* menu at the pointer. So the clicked tab's
 * menu didn't show, and the one that did belonged to another tab or the sidebar. Here a right-click
 * from outside the trigger's own elements is taken from Base UI: from inside a menu it does
 * nothing; from a backdrop, the open menus close and the click goes on to what's under it.
 */
export function routeContextMenu(event: MouseEvent<HTMLElement> & { preventBaseUIHandler: () => void }) {
  const target = event.target as Element;
  if (event.currentTarget.contains(target)) return;
  event.preventDefault();
  event.preventBaseUIHandler();
  if (!target.closest("[data-base-ui-inert]")) return;
  const { clientX, clientY } = event;
  const under = document.elementsFromPoint(clientX, clientY).find((el) => !el.closest("[data-base-ui-inert]"));
  if (!under) return;
  dismissPopups();
  // After this event: the new menu opens once the old one's state has settled.
  queueMicrotask(() =>
    under.dispatchEvent(
      new globalThis.MouseEvent("contextmenu", { bubbles: true, cancelable: true, composed: true, clientX, clientY, button: 2 }),
    ),
  );
}

/**
 * A right-click inside an open menu does nothing. React events bubble through portals to the
 * components that render them, so without this it reached the sidebar's own menu trigger around
 * the tab row and opened the sidebar menu on top of the tab's.
 */
function keepRightClickInMenu(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

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
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-content"
          className={cn(POPUP, MAX_WIDTH, className)}
          onContextMenu={keepRightClickInMenu}
          {...props}
        />
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
          onContextMenu={keepRightClickInMenu}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}
