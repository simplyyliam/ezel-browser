import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

/** Collapses or expands the sidebar (same as Ctrl+B). Used in the sidebar and, while it's collapsed, in the titlebar. */
export const SidebarToggle = () => {
  const { open, toggleSidebar } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-7"
      aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
      aria-expanded={open}
      onClick={toggleSidebar}
    >
      <PanelLeft />
    </Button>
  );
};
