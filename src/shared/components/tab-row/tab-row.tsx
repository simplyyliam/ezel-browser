import { useState, type KeyboardEvent } from "react";
import { LoaderCircle, X } from "lucide-react";
import { SidebarMenuAction, SidebarMenuButton } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { Tab } from "../../types";
import { PERF, perfCount } from "../../perf";
import { Favicon } from "../favicon/favicon";
import { SpeakerIcon } from "./speaker-icon";

interface TabRowProps {
  tab: Tab;
  active?: boolean;
  onSelect?: () => void;
  /** Shows a close button while the row is hovered or focused. */
  onClose?: () => void;
  /** The close button removes the tab (an unloaded pinned tab) rather than closing it: it says so. */
  closeRemoves?: boolean;
  /** While the tab plays sound or is muted, a speaker button toggles its mute. */
  onToggleMute?: () => void;
  /**
   * The name is being edited as an address: it shows this text (the URL, or "" for a new tab)
   * in place of the title. Null = not editing.
   */
  editValue?: string | null;
  /** Double-clicking the name asks to edit it. */
  onEdit?: () => void;
  /** Enter: the typed address (trimmed, maybe empty). Escape or leaving the field: null. */
  onEditDone?: (input: string | null) => void;
  className?: string;
}

/** The page title, else the URL's host, else "New Tab". */
export function tabLabel(tab: Tab): string {
  if (tab.title) return tab.title;
  try {
    return new URL(tab.url).host || "New Tab";
  } catch {
    return tab.url || "New Tab";
  }
}

/**
 * A sidebar tab row: favicon + title, dimmed while the tab is unloaded (no webview; selecting it
 * loads it). The title doubles as the address field: double-click (or the menu's "Change URL…")
 * swaps it for the URL in a plain text field, and Enter loads it. Place it in a SidebarMenuItem
 * or SidebarMenuSubItem. Used by folders and temp tabs.
 */
export const TabRow = ({
  tab,
  active = false,
  onSelect,
  onClose,
  closeRemoves = false,
  onToggleMute,
  editValue = null,
  onEdit,
  onEditDone,
  className,
}: TabRowProps) => {
  perfCount("row");
  const label = tabLabel(tab);
  const editing = editValue !== null;
  const speaker = !editing && !!onToggleMute && (tab.isPlayingAudio || tab.isMuted);
  const icon = tab.isLoading ? (
    <span role="status" className="flex size-4 shrink-0 items-center justify-center">
      <LoaderCircle aria-hidden className="size-3.5 animate-spin text-sidebar-foreground/50 motion-reduce:animate-none" />
      <span className="sr-only">Loading</span>
    </span>
  ) : (
    // Unloaded: greyscale and dimmed until the row is hovered (sleepy tabs).
    <Favicon src={tab.favicon} sleepy={!tab.isLoaded && !active && !editing} />
  );

  return (
    <>
      <SidebarMenuButton
        // Editing: the row stays a row, but a button can't hold a text field.
        render={editing ? <div /> : undefined}
        isActive={active}
        // Measurement builds: how scripts/measure-many-tabs.mjs finds a tab's row.
        {...(PERF ? { "data-tab-id": tab.id } : {})}
        aria-current={active ? "page" : undefined}
        title={editing ? undefined : label}
        onClick={editing ? undefined : onSelect}
        onDoubleClick={editing ? undefined : onEdit}
        className={cn(
          !tab.isLoaded && !active && !editing && "text-sidebar-foreground/45",
          // Room for the speaker and, on hover, the close button beside it.
          speaker && "group-hover/tab:pr-14 group-focus-within/tab:pr-14",
          className,
        )}
      >
        {icon}
        {editing ? (
          <AddressField initial={editValue} onDone={(input) => onEditDone?.(input)} />
        ) : (
          <>
            {/* A long title fades out at the end instead of ending in "…" (shadcn truncates the last span). */}
            <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-clip! mask-[linear-gradient(to_right,#000_calc(100%-1.25rem),transparent)]">
              {label}
            </span>
            {tab.isDev && <DevBadge />}
          </>
        )}
      </SidebarMenuButton>
      {speaker && (
        // At the row's end; on hover it steps left to make room for the close button.
        <SidebarMenuAction
          aria-label={`${tab.isMuted ? "Unmute" : "Mute"} ${label}`}
          aria-pressed={tab.isMuted}
          title={tab.isMuted ? "Unmute" : "Mute"}
          onClick={onToggleMute}
          // A press here isn't the start of a tab drag.
          onPointerDown={(event) => event.stopPropagation()}
          className={cn(
            "transition-[right,scale] duration-(--motion-base) ease-ezel-out group-hover/tab:right-7 group-hover/tab:delay-(--hover-reveal) group-focus-within/tab:right-7 motion-reduce:transition-none [&>svg]:size-3.5",
            tab.isMuted ? "text-sidebar-foreground/50" : "text-sidebar-foreground/80",
          )}
        >
          <SpeakerIcon muted={tab.isMuted} />
        </SidebarMenuAction>
      )}
      {onClose && !editing && (
        // Hover is tracked on the row itself (peer) or this tab's own item (`group/tab`), never the
        // menu item: in a folder that's the whole folder, so its hover would reveal every tab's button.
        // It appears after a short pause (--hover-reveal), so moving down the list doesn't flash a
        // button on every row it passes; it leaves at once. The speaker steps aside in step with it.
        <SidebarMenuAction
          aria-label={`${closeRemoves ? "Remove" : "Close"} ${label}`}
          title={closeRemoves ? "Remove" : "Close"}
          onClick={onClose}
          className="opacity-0 transition-[opacity,scale] duration-(--motion-fast) ease-ezel-out peer-hover/menu-button:opacity-100 peer-hover/menu-button:delay-(--hover-reveal) group-hover/tab:opacity-100 group-hover/tab:delay-(--hover-reveal) hover:opacity-100 hover:delay-0 focus-visible:opacity-100 focus-visible:delay-0 motion-reduce:transition-none [&>svg]:size-3.5"
        >
          <X aria-hidden />
        </SidebarMenuAction>
      )}
    </>
  );
};

/**
 * Marks a tab served from this machine (localhost): it's never unloaded in the background, so a
 * build under review keeps its state. Quiet: small mono text on a faint chip, like a code token.
 * Last in the row's text, so shadcn's last-span truncation would hit it; it opts out (`shrink-0`).
 */
function DevBadge() {
  return (
    <span
      title="Local dev server: never unloaded in the background"
      className="ml-auto shrink-0 overflow-visible! rounded-[5px] bg-sidebar-foreground/7 px-1 font-mono text-[10px] leading-4 font-medium tracking-tight text-sidebar-foreground/65"
    >
      dev
    </span>
  );
}

/** The title's place, as plain text: no border, background or ring, just a caret and the URL. */
function AddressField({ initial, onDone }: { initial: string; onDone: (input: string | null) => void }) {
  const [value, setValue] = useState(initial);
  // Enter and Escape blur the field, which would report a second time.
  const [done, setDone] = useState(false);
  const finish = (input: string | null) => {
    if (done) return;
    setDone(true);
    onDone(input);
  };

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Keys typed here aren't the row's (dnd-kit, menus).
    event.stopPropagation();
    if (event.key === "Enter") finish(value.trim());
    else if (event.key === "Escape") finish(null);
  }

  return (
    <input
      aria-label="Address"
      placeholder="Search or enter address"
      autoFocus
      spellCheck={false}
      autoComplete="off"
      autoCapitalize="off"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => finish(null)}
      onKeyDown={handleKeyDown}
      // Pressing in the field places the caret; it doesn't start a tab drag.
      onPointerDown={(event) => event.stopPropagation()}
      className="min-w-0 flex-1 bg-transparent p-0 text-sm outline-none placeholder:text-sidebar-foreground/40"
    />
  );
}
