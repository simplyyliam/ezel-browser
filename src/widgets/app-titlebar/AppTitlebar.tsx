import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import {
  PermissionCard,
  SiteButton,
  SiteInfoPanel,
} from "@/features/app-titlebar/site-identity";
import { WindowControls } from "@/features/app-titlebar/window-controls";
import {
  coverPage,
  getCursorPosition,
  getWindowClientRect,
  openSitePermissions,
  originOf,
  reportError,
  revokeSitePermission,
  showToast,
  siteHost,
  uncoverPage,
  useContentCutout,
  usePage,
  usePageCover,
  usePermissionAsks,
  useSitePermissions,
  useTabs,
} from "@/shared";
import { commands } from "@/shared/bindings";

// Peek behaviour follows Zen's compact-mode toolbar (zen-browser/desktop, src/zen/compact-mode):
// the bar opens as soon as the top edge is hovered, closes on the next frame after the pointer
// leaves it, and stays open while the pointer is just above the window.
// Look follows Zen's default (zen.view.shift-down-site-on-hover = false): the bar's height grows
// from the edge strip over 150ms ease-in-out while its contents fade in, and the page does NOT
// move; the bar covers its top. No shadow. The website is a native webview drawn above all UI,
// so the bar's rect is cut out of it (useContentCutout) for the bar to show through.

/** How far above the window (logical px) the pointer may go before the bar closes. Zen: outside-window-edge-offset.vertical. */
const OUTSIDE_TOP_OFFSET = 100;
/** A pointer leaving the document this close to the bar counts as leaving through it. Zen: _getCrossedEdge / _positionInBounds. */
const EDGE_TOLERANCE = 10;
/** Fallback when the cursor can't be read outside the window. Zen: toolbar-hide-after-hover.duration. */
const HIDE_AFTER_EXIT = 1000;

const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));

async function clearSiteData() {
  try {
    const result = await commands.clearSiteData();
    if (result.status === "ok")
      showToast({
        title: "Site data cleared",
        detail: result.data,
        tone: "done",
      });
    else reportError("clear site data", result.error);
  } catch (error) {
    reportError("clear site data", error);
  }
}

export const AppTitlebar = () => {
  const [open, setOpen] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const page = usePage();
  const tabs = useTabs();
  const host = siteHost(page.url);
  // The site info panel, for the host it was opened on: another site closes it.
  const [panelHost, setPanelHost] = useState<string | null>(null);
  const panelOpen = panelHost !== null && panelHost === host;
  // A site asking for a permission opens the bar by itself (only the shown tab's asks show; Rust
  // declines the others' when the tab changes).
  const { asks, answer } = usePermissionAsks(tabs?.activeTabId ?? null);
  const ask = asks[0] ?? null;
  const origin = originOf(page.url);
  const sitePermissions =
    useSitePermissions(panelOpen).find((s) => s.origin === origin) ?? null;
  // The panel doesn't hold the bar open: the bar leaves with the pointer, the panel stays.
  const shown = open || ask !== null;

  const closePanel = () => setPanelHost(null);
  // The page is swapped for its picture first (shared/page-cover), so the panel is plain UI over
  // it: smooth corners, its own fade, nothing cut out of the website. Without a picture the page
  // stays and the panel is cut out of it like any popup (in one piece).
  const overCover = usePageCover()?.covered ?? false;
  const openPanel = async (forHost: string) => {
    await coverPage();
    setPanelHost(forHost);
  };

  useEffect(() => {
    const zone = zoneRef.current;
    const bar = barRef.current;
    if (!zone || !bar) return;

    let closeFrame = 0;
    let tracking = false;
    let fallback: ReturnType<typeof setTimeout> | undefined;

    const stopTracking = () => {
      tracking = false;
      clearTimeout(fallback);
    };

    const close = () => {
      stopTracking();
      cancelAnimationFrame(closeFrame);
      setOpen(false);
    };

    /** Client point (logical px) within the bar, with some slack above and to the sides. */
    const nearBar = (x: number, y: number) => {
      const r = bar.getBoundingClientRect();
      return (
        x >= r.left - EDGE_TOLERANCE &&
        x <= r.right + EDGE_TOLERANCE &&
        y >= r.top - EDGE_TOLERANCE &&
        y <= r.bottom
      );
    };

    // The pointer left the window through the top edge (or a native window drag took it):
    // keep the bar open and follow the cursor outside, like Zen's native mouse tracker.
    const keepOpenOutside = async () => {
      cancelAnimationFrame(closeFrame);
      setOpen(true);
      if (tracking) return;
      tracking = true;
      try {
        const win = await getWindowClientRect();
        const maxOffset = OUTSIDE_TOP_OFFSET * win.scale;
        while (tracking) {
          const { x, y } = await getCursorPosition();
          if (!tracking) return;
          const withinX = x >= win.x && x <= win.x + win.width;
          const inWindow = withinX && y >= win.y && y <= win.y + win.height;
          if (inWindow) {
            // Back inside: stay open only if the pointer came back onto the bar.
            stopTracking();
            if (!nearBar((x - win.x) / win.scale, (y - win.y) / win.scale))
              close();
            return;
          }
          if (!withinX || y < win.y - maxOffset || y > win.y) {
            close();
            return;
          }
          await nextFrame();
        }
      } catch {
        if (tracking) fallback = setTimeout(close, HIDE_AFTER_EXIT);
      }
    };

    const onEnter = () => {
      cancelAnimationFrame(closeFrame);
      stopTracking();
      setOpen(true);
    };

    const onLeave = (e: MouseEvent) => {
      if (e.relatedTarget === null && nearBar(e.clientX, e.clientY)) {
        keepOpenOutside();
        return;
      }
      // Re-check on the next tick like Zen does: a leave can be spurious.
      setTimeout(() => {
        if (tracking || zone.matches(":hover")) return;
        closeFrame = requestAnimationFrame(() => setOpen(false));
      });
    };

    // Minimize/maximize/restore can move the bar out from under a pointer that never "left" it.
    const onResize = () => {
      setTimeout(() => {
        if (!tracking && !zone.matches(":hover")) close();
      });
    };

    zone.addEventListener("mouseover", onEnter);
    zone.addEventListener("mouseleave", onLeave);
    window.addEventListener("resize", onResize);
    return () => {
      stopTracking();
      cancelAnimationFrame(closeFrame);
      zone.removeEventListener("mouseover", onEnter);
      zone.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Keep the bar's rect cut out of the website on every frame of its height transition.
  useContentCutout("titlebar", () => barRef.current);

  return (
    // Overlays the top of the window (outside the frame's padding) so nothing below moves.
    // Closed, it's just the edge strip; open, its height grows to fit the controls.
    <div ref={zoneRef} className="absolute inset-x-0 top-0 z-50">
      <div
        // Zen animates the toolbar's height; 0fr -> 1fr is the CSS way to animate to its natural height.
        className={cn(
          "grid transition-[grid-template-rows] duration-(--motion-base) ease-ezel-in-out motion-reduce:transition-none",
          shown ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div ref={barRef} className="min-h-1 overflow-hidden bg-background">
          <div
            className={cn(
              "transition-opacity duration-(--motion-base) ease-ezel-in-out motion-reduce:transition-none",
              shown ? "opacity-100" : "opacity-0",
            )}
          >
            {/* The site in the middle, the window controls on the right. Empty space drags the window. */}
            <div
              data-tauri-drag-region
              className="grid w-full select-none grid-cols-[1fr_auto_1fr] items-center"
            >
              <div data-tauri-drag-region />
              <div className="flex min-w-0 max-w-[50vw] justify-center">
                {host && (
                  <SiteButton
                    host={host}
                    security={page.security}
                    open={panelOpen}
                    onToggle={() =>
                      panelOpen ? closePanel() : openPanel(host)
                    }
                  />
                )}
              </div>
              <div data-tauri-drag-region className="flex justify-end">
                <WindowControls />
              </div>
            </div>
            {ask && (
              <PermissionCard
                key={ask.id}
                ask={ask}
                onAnswer={(allow) => answer(ask.id, allow)}
              />
            )}
          </div>
        </div>
      </div>
      {/* The site info panel: just under where the address sits, top-centre, and it stays when the
          bar hides. Esc, a click outside or the UI losing focus closes it; the page comes back
          once it has faded. */}
      <Dialog
        open={panelOpen}
        onOpenChange={(next) => !next && closePanel()}
        onOpenChangeComplete={(next) => !next && uncoverPage()}
      >
        <DialogPortal>
          {/* No dimming: only the panel shows. The backdrop just catches a click outside. */}
          <DialogOverlay className="bg-transparent supports-backdrop-filter:backdrop-blur-none" />
          <DialogPrimitive.Popup
            data-slot="dialog-content"
            data-over-cover={overCover || undefined}
            aria-label={host ? `About ${host}` : "Site information"}
            className="fixed top-10 left-1/2 z-50 w-72 max-w-[calc(100%-1rem)] origin-top -translate-x-1/2 rounded-2xl bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/5 duration-100 outline-none dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            {host && (
              <SiteInfoPanel
                host={host}
                security={page.security}
                onClearData={() => {
                  closePanel();
                  clearSiteData();
                }}
                permissions={sitePermissions}
                onRevoke={(permission) =>
                  origin && revokeSitePermission(origin, permission)
                }
                onManageAll={() => {
                  closePanel();
                  openSitePermissions();
                }}
              />
            )}
          </DialogPrimitive.Popup>
        </DialogPortal>
      </Dialog>
    </div>
  );
};
