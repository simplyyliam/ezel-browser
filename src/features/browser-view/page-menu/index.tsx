import { Fragment, useRef } from "react"
import { Menu } from "@base-ui/react/menu"
import { cn } from "@/lib/utils"
import { menuLabel } from "@/shared"
import type { PageMenu as PageMenuData, PageMenuAction } from "@/shared/bindings"

/** Each entry's label, from the menu catalog (areas page, link, image, editable, selection). */
const LABELS: Record<Exclude<PageMenuAction, "searchSelection">, () => string> = {
  back: () => menuLabel("page", "back"),
  forward: () => menuLabel("page", "forward"),
  reload: () => menuLabel("page", "reload"),
  inspect: () => menuLabel("page", "inspect"),
  openLinkInNewTab: () => menuLabel("link", "openInNewTab"),
  copyLink: () => menuLabel("link", "copyLink"),
  openImageInNewTab: () => menuLabel("image", "openInNewTab"),
  copyImage: () => menuLabel("image", "copyImage"),
  copyImageAddress: () => menuLabel("image", "copyImageAddress"),
  saveImage: () => menuLabel("image", "saveImage"),
  undo: () => menuLabel("editable", "undo"),
  redo: () => menuLabel("editable", "redo"),
  cut: () => menuLabel("editable", "cut"),
  copy: () => menuLabel("editable", "copy"),
  paste: () => menuLabel("editable", "paste"),
  pasteAsPlainText: () => menuLabel("editable", "pastePlain"),
  selectAll: () => menuLabel("editable", "selectAll"),
}

const label = (action: PageMenuAction, selection: string | null) =>
  action === "searchSelection" ? `Search for “${selection ?? ""}”` : LABELS[action]()

// Same look as shadcn's context menu (components/ui stays at registry defaults, so it's composed here).
const POPUP =
  "z-50 max-h-(--available-height) min-w-48 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
const ITEM =
  "relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50"

type PageMenuProps = {
  menu: PageMenuData
  /** The choice, or null when it closes without one, for this menu's id. Called once. */
  onClose: (id: number, action: PageMenuAction | null) => void
}

/**
 * The website's right-click menu, drawn by Ezel at the pointer. The page is a native webview over
 * the UI, so the menu is cut out of it like every popup (usePopupCutouts) and shows in one piece
 * (a hole can't fade). Items that don't apply aren't there; ones that can't run now are dimmed
 * (Paste with nothing to paste).
 */
export function PageMenu({ menu, onClose }: PageMenuProps) {
  const done = useRef(false)
  const finish = (action: PageMenuAction | null) => {
    if (done.current) return
    done.current = true
    onClose(menu.id, action)
  }
  // A point, not an element: the menu opens with its corner at the pointer.
  const anchor = {
    getBoundingClientRect: () => DOMRect.fromRect({ x: menu.x, y: menu.y, width: 0, height: 0 }),
  }

  return (
    <Menu.Root open onOpenChange={(open) => !open && finish(null)}>
      <Menu.Portal>
        <Menu.Positioner anchor={anchor} side="bottom" align="start" sideOffset={2} collisionPadding={6} className="isolate z-50 outline-none">
          <Menu.Popup data-slot="page-menu-content" className={POPUP}>
            {menu.groups.map((group, index) => (
              <Fragment key={index}>
                {index > 0 && <Menu.Separator className="-mx-1 my-1 h-px bg-border" />}
                {group.map((entry) => (
                  <Menu.Item
                    key={entry.action}
                    disabled={!entry.enabled}
                    onClick={() => finish(entry.action)}
                    className={cn(ITEM, entry.action === "searchSelection" && "max-w-72")}
                  >
                    <span className="truncate">{label(entry.action, menu.selection)}</span>
                  </Menu.Item>
                ))}
              </Fragment>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
