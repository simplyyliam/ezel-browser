import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Dialog, DialogPortal } from "@/components/ui/dialog"
import { SiteList } from "@/features/site-permissions/site-list"
import { revokeSitePermission, setSitePermissionsOpen, useSitePermissions, useSitePermissionsOpen } from "@/shared"

/**
 * Site Permissions: every site's remembered camera, microphone, location and clipboard answers, to
 * review and forget. Opened from the site panel ("All Site Permissions…") or the palette. Like the
 * palette, composed without a backdrop (it would dim the UI but not the page) and cut out of the
 * page by usePopupCutouts. Mount once (AppLayout).
 */
export function SitePermissions() {
  const open = useSitePermissionsOpen()
  const sites = useSitePermissions(open)
  return (
    <Dialog open={open} onOpenChange={setSitePermissionsOpen}>
      <DialogPortal>
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className="fixed top-[16%] left-1/2 z-50 flex w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-popover text-popover-foreground ring-1 ring-foreground/10 outline-none transition-opacity duration-(--motion-fast) data-ending-style:opacity-0 data-starting-style:opacity-0"
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <DialogPrimitive.Title className="text-sm font-semibold">Site Permissions</DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              Done
            </DialogPrimitive.Close>
          </div>
          <SiteList sites={sites} onRevoke={revokeSitePermission} />
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}
