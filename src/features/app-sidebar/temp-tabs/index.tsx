import { Plus } from "lucide-react"
import { SidebarSeparator } from "@/components/ui/sidebar"
import { TabRow } from "@/shared/components"
import type { Tab } from "@/shared"

type TempTabsProps = {
  tabs: Tab[]
}

/** Temporary (unpinned) tabs below the space's list. Non-functional for now. */
export function TempTabs({ tabs }: TempTabsProps) {
  return (
    <div className="flex flex-col">
      <SidebarSeparator className="mx-2 my-2 bg-sidebar-foreground/6" />
      <ul className="flex flex-col gap-0.5">
        {tabs.map((tab) => (
          <li key={tab.id}>
            {/* TODO: select / close the temp tab once real tab state exists. */}
            <TabRow tab={tab} />
          </li>
        ))}
      </ul>
      {/* Deliberately inset and dimmed: available, but not the focus. TODO: open a new tab. */}
      <button
        type="button"
        className="mx-4 mt-2 flex h-8 items-center gap-2 rounded-[9px] bg-sidebar-foreground/[0.025] px-3 text-[13px] text-sidebar-foreground/35 outline-none transition-colors hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground/50 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <Plus aria-hidden className="size-3.5" />
        New Tab
      </button>
    </div>
  )
}
