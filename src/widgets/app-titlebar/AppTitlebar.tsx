import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { QuickTabs } from "@/features/app-titlebar/quick-tabs";
import { SiteButton, SiteInfoPanel } from "@/features/app-titlebar/site-identity";
import { WindowControls } from "@/features/app-titlebar/window-controls";
import {
  getCursorPosition,
  getWindowClientRect,
  reportError,
  showToast,
  siteHost,
  unwrap,
  useContentCutout,
  usePage,
  useTabs,
  type Id,
  type Tab,
  type TabsState,
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

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/**
 * The tabs the peek offers next to the shown one: the other tabs of its folder, or outside a
 * folder the Swatches (without the shown one).
 */
function nearbyTabs(tabs: TabsState | null): Tab[] {
  if (!tabs || tabs.activeTabId === null) return [];
  const active = tabs.activeTabId;
  for (const space of tabs.spaces) {
    for (const item of space.items) {
      if (item.kind === "folder" && item.folder.tabs.some((tab) => tab.id === active)) {
        return item.folder.tabs.filter((tab) => tab.id !== active);
      }
    }
  }
  return tabs.swatches.filter((tab): tab is Tab => tab !== null && tab.id !== active);
}

async function clearSiteData() {
  try {
    const result = await commands.clearSiteData();
    if (result.status === "ok") showToast({ title: "Site data cleared", detail: result.data, tone: "done" });
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
  const shown = open || panelOpen;

  const closePanel = () => {
    setPanelHost(null);
    // The bar stays only while the pointer is on it.
    if (!zoneRef.current?.matches(":hover")) setOpen(false);
  };

  // The panel closes on Esc, a press anywhere else, and the UI losing focus (a click on the page).
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && closePanel();
    const onPress = (event: PointerEvent) => {
      if (!zoneRef.current?.contains(event.target as Node)) closePanel();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("blur", closePanel);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("blur", closePanel);
    };
  });

  const selectTab = (id: Id) => unwrap("activate tab", commands.activateTab(id));

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
            if (!nearBar((x - win.x) / win.scale, (y - win.y) / win.scale)) close();
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
          "grid transition-[grid-template-rows] duration-150 ease-in-out motion-reduce:transition-none",
          shown ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div ref={barRef} className="min-h-1 overflow-hidden bg-background">
          <div
            className={cn(
              "transition-opacity duration-150 ease-in-out motion-reduce:transition-none",
              shown ? "opacity-100" : "opacity-0",
            )}
          >
            {/* Nearby tabs, the site, the window controls. Empty space in the row drags the window. */}
            <div data-tauri-drag-region className="grid w-full select-none grid-cols-[1fr_auto_1fr] items-center">
              <div data-tauri-drag-region className="flex min-w-0 items-center">
                <QuickTabs tabs={nearbyTabs(tabs)} onSelect={selectTab} />
              </div>
              <div className="flex min-w-0 max-w-[50vw] justify-center">
                {host && (
                  <SiteButton
                    host={host}
                    security={page.security}
                    open={panelOpen}
                    onToggle={() => (panelOpen ? closePanel() : setPanelHost(host))}
                  />
                )}
              </div>
              <div data-tauri-drag-region className="flex justify-end">
                <WindowControls />
              </div>
            </div>
            {panelOpen && host && (
              <SiteInfoPanel
                host={host}
                security={page.security}
                onClearData={() => {
                  closePanel();
                  clearSiteData();
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
