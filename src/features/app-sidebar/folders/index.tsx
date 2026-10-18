import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Folder as FolderClosedIcon, FolderOpen } from "lucide-react"
import { TabRow } from "@/shared/components"
import { INSTANT, PEEK_TRANSITION, type Folder, type SpaceItem } from "@/shared"

// TODO: drag a tab onto a folder, and right-click > "Create folder". Not built yet.

type FoldersProps = {
  /** The active space's list: folders and standalone tabs, in order. */
  items: SpaceItem[]
  defaultActiveTabId?: string
}

/** The active space's folders and tabs. Folder open state and the active tab are local for now. */
export function Folders({ items, defaultActiveTabId }: FoldersProps) {
  const [activeTabId, setActiveTabId] = useState(defaultActiveTabId)
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())

  const toggle = (folderId: string) =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (!next.delete(folderId)) next.add(folderId)
      return next
    })

  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) =>
        item.kind === "folder" ? (
          <li key={item.folder.id}>
            <FolderGroup
              folder={item.folder}
              open={!closed.has(item.folder.id)}
              onToggle={() => toggle(item.folder.id)}
              activeTabId={activeTabId}
              onSelectTab={setActiveTabId}
            />
          </li>
        ) : (
          <li key={item.tab.id}>
            <TabRow
              tab={item.tab}
              active={item.tab.id === activeTabId}
              onSelect={() => setActiveTabId(item.tab.id)}
            />
          </li>
        ),
      )}
    </ul>
  )
}

type FolderGroupProps = {
  folder: Folder
  open: boolean
  onToggle: () => void
  activeTabId: string | undefined
  onSelectTab: (tabId: string) => void
}

function FolderGroup({ folder, open, onToggle, activeTabId, onSelectTab }: FolderGroupProps) {
  const reduceMotion = useReducedMotion()
  const transition = reduceMotion ? INSTANT : PEEK_TRANSITION
  const Icon = open ? FolderOpen : FolderClosedIcon

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex h-4 w-full min-w-0 items-center gap-1.5 rounded-[5px] text-left text-[9px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <Icon aria-hidden className="size-2.5 shrink-0 text-sidebar-foreground" />
        <span className="truncate">{folder.name}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            key="tabs"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transition}
            className="flex flex-col gap-0.5 overflow-hidden px-2.5 pt-1.5"
          >
            {folder.tabs.map((tab) => (
              <li key={tab.id}>
                <TabRow tab={tab} active={tab.id === activeTabId} onSelect={() => onSelectTab(tab.id)} />
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </>
  )
}
