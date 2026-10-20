import { useState, type KeyboardEvent } from "react";
import { LoaderCircle, X } from "lucide-react";
import { SidebarMenuAction, SidebarMenuButton } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { Tab } from "../../types";
import { Favicon } from "../favicon/favicon";
import { SpeakerIcon } from "./speaker-icon";

interface TabRowProps {
  tab: Tab;
  active?: boolean;
  onSelect?: () => void;
  /** Shows a close button while the row is hovered or focused. */
  onClose?: () => void;
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
  onToggleMute,
  editValue = null,
  onEdit,
  onEditDone,
  className,
}: TabRowProps) => {
  const label = tabLabel(tab);
  const editing = editValue !== null;
  const speaker = !editing && !!onToggleMute && (tab.isPlayingAudio || tab.isMuted);
  const icon = tab.isLoading ? (
    <span role="status" className="flex size-4 shrink-0 items-center justify-center">
      <LoaderCircle aria-hidden className="size-3.5 animate-spin text-sidebar-foreground/50 motion-reduce:animate-none" />
      <span className="sr-only">Loading</span>
    </span>
  ) : (
    <Favicon src={tab.favicon} />
  );

  return (
    <>
      <SidebarMenuButton
        // Editing: the row stays a row, but a button can't hold a text field.
        render={editing ? <div /> : undefined}
        isActive={active}
        aria-current={active ? "page" : undefined}
        title={editing ? undefined : label}
        onClick={editing ? undefined : onSelect}
        onDoubleClick={editing ? undefined : onEdit}
        className={cn(
          !tab.isLoaded && !active && !editing && "text-sidebar-foreground/45 [&_img]:opacity-50",
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
            <span className="min-w-0 truncate">{label}</span>
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
            "transition-[right] duration-150 ease-out group-hover/tab:right-7 group-focus-within/tab:right-7 motion-reduce:transition-none [&>svg]:size-3.5",
            tab.isMuted ? "text-sidebar-foreground/50" : "text-sidebar-foreground/80",
          )}
        >
          <SpeakerIcon muted={tab.isMuted} />
        </SidebarMenuAction>
      )}
      {onClose && !editing && (
        // Hover is tracked on the row itself (peer) or this tab's own item (`group/tab`), never the
        // menu item: in a folder that's the whole folder, so its hover would reveal every tab's button.
        <SidebarMenuAction
          aria-label={`Close ${label}`}
          onClick={onClose}
          className="opacity-0 peer-hover/menu-button:opacity-100 group-hover/tab:opacity-100 hover:opacity-100 focus-visible:opacity-100 [&>svg]:size-3.5"
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
