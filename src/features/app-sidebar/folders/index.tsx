import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Folder as FolderClosedIcon, FolderOpen } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import {
  ContextMenuEntries,
  SidebarMenuPopup,
  DraggableTabItem,
  DropIndicator,
  NameField,
  type MenuGroups,
  type TabRowActions,
} from "@/shared/components"
import {
  DROP_ROW,
  folderRow,
  folderTabs,
  INSTANT,
  menuLabel,
  PEEK_TRANSITION,
  rowIndicator,
  useTabDropZone,
  type Folder,
  type Id,
  type Space,
  type SpaceItem,
} from "@/shared"

/** Longest folder name (Rust's MAX_FOLDER_NAME). */
const MAX_FOLDER_NAME = 60

/** What a folder's menu can do. The widget holds the commands; this feature only offers them. */
export type FolderActions = {
  setCollapsed: (folderId: Id, collapsed: boolean) => void
  /** Rename Folder… (and every new folder): its name becomes a field. */
  startRename: (folderId: Id) => void
  /** The typed name; null (Escape) or empty keeps the old one. */
  finishRename: (folderId: Id, name: string | null) => void
  newTabIn: (folderId: Id) => void
  unload: (folderId: Id) => void
  moveToSpace: (folderId: Id, spaceId: Id) => void
  /** Unpack: its tabs stay pinned where it was. */
  unpack: (folderId: Id) => void
  /** Delete: its tabs go too (asked first). */
  remove: (folderId: Id) => void
}

type FoldersProps = {
  /** The active space's pinned list: folders and standalone tabs, in order. */
  items: SpaceItem[]
  /** Every space, for Move to Space ▸. */
  spaces: Space[]
  spaceId: Id
  /** Selecting, closing (pinned tabs only unload), the menu, editing the address, drag state. */
  actions: TabRowActions
  folderActions: FolderActions
  /** The folder whose name is a field right now. */
  renamingFolderId: Id | null
  /** Where a drag would land: the number of top-level items above the line. */
  dropGap: number | null
  /** A drag into a folder: its tabs above the line, or null for into the folder (its row lights up). */
  dropFolder: { folderId: Id; gap: number | null } | null
}

/** The active space's folders and pinned tabs. Open/closed state lives in the backend. */
export function Folders({ items, spaces, spaceId, actions, folderActions, renamingFolderId, dropGap, dropFolder }: FoldersProps) {
  // The whole group takes drops, so the gaps between rows count too.
  const { setNodeRef } = useTabDropZone("pinned", { kind: "pinned" })
  const [deleting, setDeleting] = useState<Folder | null>(null)

  return (
    <SidebarGroup ref={setNodeRef}>
      <SidebarGroupContent>
        {/* 2px between rows; the drop line fills that gap. */}
        <SidebarMenu className="gap-0.5">
          {items.map((item, index) => {
            const indicator = rowIndicator(dropGap, index, items.length)
            return item.kind === "folder" ? (
              <FolderItem
                key={`folder-${item.folder.id}`}
                folder={item.folder}
                menu={folderMenu(item.folder, spaces, spaceId, folderActions, () => setDeleting(item.folder))}
                folderActions={folderActions}
                renaming={item.folder.id === renamingFolderId}
                actions={actions}
                indicator={indicator}
                drop={dropFolder?.folderId === item.folder.id ? dropFolder.gap : undefined}
              />
            ) : (
              <DraggableTabItem
                key={`tab-${item.tab.id}`}
                tab={item.tab}
                source="pinned"
                actions={actions}
                indicator={indicator}
              />
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
      <DeleteFolderAlert
        folder={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDelete={(folder) => {
          setDeleting(null)
          folderActions.remove(folder.id)
        }}
      />
    </SidebarGroup>
  )
}

type FolderItemProps = {
  folder: Folder
  menu: () => MenuGroups
  folderActions: FolderActions
  renaming: boolean
  actions: TabRowActions
  /** A drop line above or below the whole folder. */
  indicator: "top" | "bottom" | null
  /** A drop into this folder: null = into its row, a number = the gap among its tabs; undefined = none. */
  drop: number | null | undefined
}

function FolderItem({ folder, menu, folderActions, renaming, actions, indicator, drop }: FolderItemProps) {
  const reduceMotion = useReducedMotion()
  const transition = reduceMotion ? INSTANT : PEEK_TRANSITION
  const open = !folder.collapsed
  const Icon = open ? FolderOpen : FolderClosedIcon
  const icon = <Icon aria-hidden />

  return (
    // One list row with its open tabs: drops beside it go above or below the whole folder.
    <SidebarMenuItem {...DROP_ROW}>
      {indicator && <DropIndicator edge={indicator} />}
      {renaming ? (
        <NameField
          name={folder.name}
          label="Folder name"
          maxLength={MAX_FOLDER_NAME}
          icon={icon}
          className="h-7 text-sidebar-foreground/70 [&_svg]:text-sidebar-foreground"
          onDone={(name) => folderActions.finishRename(folder.id, name)}
        />
      ) : (
        <ContextMenu>
          <ContextMenuTrigger className="contents">
            <SidebarMenuButton
              size="sm"
              aria-expanded={open}
              onClick={() => folderActions.setCollapsed(folder.id, open)}
              {...folderRow(folder.id)}
              className={cn(
                "text-sidebar-foreground/70 [&_svg]:text-sidebar-foreground",
                // A tab held over the middle of the row goes into the folder.
                drop === null && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              {icon}
              <span>{folder.name}</span>
            </SidebarMenuButton>
          </ContextMenuTrigger>
          <SidebarMenuPopup className="min-w-48">
            <ContextMenuEntries groups={menu()} />
          </SidebarMenuPopup>
        </ContextMenu>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="tabs"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transition}
            className="overflow-hidden"
          >
            {/* Indented without the default tree line, as in the design. */}
            <SidebarMenuSub
              {...folderTabs(folder.id)}
              className="mx-0 translate-x-0 gap-0.5 border-l-0 pt-0.5 pb-0 pr-0 pl-3"
            >
              {folder.tabs.map((tab, index) => (
                <DraggableTabItem
                  key={tab.id}
                  sub
                  tab={tab}
                  source="folder"
                  actions={actions}
                  indicator={rowIndicator(drop ?? null, index, folder.tabs.length)}
                />
              ))}
            </SidebarMenuSub>
          </motion.div>
        )}
      </AnimatePresence>
    </SidebarMenuItem>
  )
}

/** The folder's right-click menu (catalog area "folder"). Items that don't apply are left out. */
function folderMenu(folder: Folder, spaces: Space[], spaceId: Id, actions: FolderActions, askDelete: () => void) {
  return (): MenuGroups => [
    [
      { label: menuLabel("folder", "rename"), onSelect: () => actions.startRename(folder.id) },
      { label: menuLabel("folder", "newTabInFolder"), onSelect: () => actions.newTabIn(folder.id) },
    ],
    [
      {
        label: menuLabel("folder", folder.collapsed ? "expand" : "collapse"),
        onSelect: () => actions.setCollapsed(folder.id, !folder.collapsed),
      },
      ...(folder.tabs.some((tab) => tab.isLoaded)
        ? [{ label: menuLabel("folder", "unload"), onSelect: () => actions.unload(folder.id) }]
        : []),
      {
        label: menuLabel("folder", "moveToSpace"),
        items: spaces
          .filter((space) => space.id !== spaceId)
          .map((space) => ({ label: space.name, onSelect: () => actions.moveToSpace(folder.id, space.id) })),
      },
    ],
    [
      ...(folder.tabs.length > 0 ? [{ label: menuLabel("folder", "unpack"), onSelect: () => actions.unpack(folder.id) }] : []),
      // An empty folder has nothing to lose: no question then.
      {
        label: menuLabel("folder", "delete"),
        destructive: true,
        onSelect: folder.tabs.length > 0 ? askDelete : () => actions.remove(folder.id),
      },
    ],
  ]
}

/**
 * Deleting a folder with tabs is uncommon and can't be undone: an alert asks first (HIG
 * alerts.md), and offers keeping the tabs (Unpack) in the same breath.
 */
function DeleteFolderAlert({
  folder,
  onOpenChange,
  onDelete,
}: {
  folder: Folder | null
  onOpenChange: (open: boolean) => void
  onDelete: (folder: Folder) => void
}) {
  const count = folder?.tabs.length ?? 0
  return (
    <AlertDialog open={folder !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{folder?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Its {count} {count === 1 ? "tab" : "tabs"} will be closed too. To keep them, choose Unpack Folder instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => folder && onDelete(folder)}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
