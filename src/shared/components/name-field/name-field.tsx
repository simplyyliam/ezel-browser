import { useState, type KeyboardEvent, type ReactNode } from "react";
import { SidebarMenuButton } from "@/components/ui/sidebar";

interface NameFieldProps {
  name: string;
  /** What's being named, for screen readers ("Space name", "Folder name"). */
  label: string;
  icon: ReactNode;
  maxLength: number;
  /** Enter or leaving the field: the trimmed name (maybe empty). Escape: null. */
  onDone: (name: string | null) => void;
  className?: string;
}

/**
 * A sidebar row's name as plain text you can type into, like a tab's address field: no border,
 * background or ring. Used to rename spaces and folders inline (and new ones start in it).
 */
export function NameField({ name, label, icon, maxLength, onDone, className }: NameFieldProps) {
  const [value, setValue] = useState(name);
  // Enter and Escape blur the field, which would report a second time.
  const [done, setDone] = useState(false);
  const finish = (result: string | null) => {
    if (done) return;
    setDone(true);
    onDone(result);
  };
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    event.stopPropagation();
    if (event.key === "Enter") finish(value.trim());
    else if (event.key === "Escape") finish(null);
  }

  return (
    <SidebarMenuButton render={<div />} isActive className={className}>
      {icon}
      <input
        aria-label={label}
        autoFocus
        maxLength={maxLength}
        spellCheck={false}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={() => finish(value.trim())}
        onKeyDown={handleKeyDown}
        // Pressing in the field places the caret; it doesn't start a drag.
        onPointerDown={(event) => event.stopPropagation()}
        className="min-w-0 flex-1 bg-transparent p-0 text-sm font-medium outline-none"
      />
    </SidebarMenuButton>
  );
}
