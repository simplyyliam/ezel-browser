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
      <SidebarSeparator className="mx-2 my-1.5 bg-sidebar-foreground/6" />
      <ul className="flex flex-col gap-0.5">
        {tabs.map((tab) => (
          <li key={tab.id}>
            {/* TODO: select / close the temp tab once real tab state exists. */}
            <TabRow tab={tab} className="px-2" />
          </li>
        ))}
      </ul>
      {/* Deliberately inset and dimmed: available, but not the focus. TODO: open a new tab. */}
      <button
        type="button"
        className="mx-3.5 mt-1.5 flex h-[26px] items-center gap-1.5 rounded-[7.5px] bg-sidebar-foreground/[0.025] px-2.5 text-[10.5px] text-sidebar-foreground/35 outline-none transition-colors hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground/50 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <Plus aria-hidden className="size-2.5" />
        New Tab
      </button>
    </div>
  )
}
