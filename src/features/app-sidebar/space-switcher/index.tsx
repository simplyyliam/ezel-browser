import { createElement, useState, type ReactNode } from "react"
import { ChevronsUpDown, Plus } from "lucide-react"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { ContextMenuEntries, Favicon, NameField, SidebarMenuPopup, type MenuGroups } from "@/shared/components"
import {
  menuLabel,
  SPACE_ICON_NAMES,
  spaceIcon,
  useTabDropZone,
  type Id,
  type Space,
  type Tab,
} from "@/shared"

// Spaces: the shown space's title, a pop-up button over its own tabs.
//
// Why (2026-10-19): spaces were a row of pills between the Swatches and the tabs, and every new
// space made the row longer until it overflowed the sidebar. Zen and Arc keep a dock of space
// icons at the bottom; Ezel doesn't copy that.
// - A pop-up button shows the current choice and pops up the rest: "a flat list of mutually
//   exclusive options... a space-efficient way to present a wide array of choices" (HIG
//   pop-up-buttons.md › Best practices). One row, however many spaces there are; the ⇅ sign says
//   "one of several".
// - Designers know it: the title reads like the page name above a design file's layers, and the
//   list like its page picker.
// - Ezel's own touch: each space in the list shows a small "palette" of its first pinned favicons,
//   so a space is recognised before its name is read (the Swatches idea, applied to spaces).
// - Actions on the space are its right-click menu (catalog area "space"), never mixed into the
//   list: a pop-up button holds choices, not commands (HIG pull-down-buttons.md). New Space is the
//   list's last item, its "Custom…" (pop-up-buttons.md).
// - Delete asks in an alert: uncommon, irreversible, and it takes the space's tabs with it
//   (HIG alerts.md). Change Icon… is a small popover under the title (HIG popovers.md).
// - Dragging a tab: resting on the title springs the list open, resting on a space switches to it
//   (macOS spring-loading; see useTabDrag). Swatches never switch spaces: they're in every space.
// Everything opens below the title at the sidebar's width: the website covers anything beyond.

type SpaceSwitcherProps = {
  spaces: Space[]
  activeSpaceId: Id
  /** The shown tab: "Unload Space" leaves it alone. */
  shownTabId: Id | null
  onSelect: (spaceId: Id) => void
  onCreate: () => void
  onRename: (spaceId: Id, name: string) => void
  onChangeIcon: (spaceId: Id, icon: string) => void
  onMove: (spaceId: Id, index: number) => void
  onUnload: (spaceId: Id) => void
  /** `moveTo`: the space that takes its tabs and folders; null closes them with it. */
  onDelete: (spaceId: Id, moveTo: Id | null) => void
  /** The space whose title is being renamed inline ("Rename Space…", and a new space starts so). */
  renamingSpaceId: Id | null
  onRenamingChange: (spaceId: Id | null) => void
  /** The list is controlled: a dragged tab resting on the title springs it open. */
  listOpen: boolean
  onListOpenChange: (open: boolean) => void
  /** The space a dragged tab rests on in the list: it switches there in a moment. */
  dropSpaceId: Id | null
}

export function SpaceSwitcher(props: SpaceSwitcherProps) {
  const { spaces, activeSpaceId, renamingSpaceId } = props
  const space = spaces.find((s) => s.id === activeSpaceId)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // The title's own drop zone: resting a dragged tab here opens the list.
  const { setNodeRef } = useTabDropZone("spaces", { kind: "spaces" })
  if (!space) return null

  return (
    <SidebarGroup className="py-1">
      <SidebarMenu>
        <SidebarMenuItem ref={setNodeRef}>
          {space.id === renamingSpaceId ? (
            <NameField
              name={space.name}
              label="Space name"
              maxLength={40}
              icon={<SpaceIcon name={space.icon} className="size-4 shrink-0" />}
              onDone={(name) => {
                if (name && name !== space.name) props.onRename(space.id, name)
                props.onRenamingChange(null)
              }}
            />
          ) : (
            <ContextMenu>
              <ContextMenuTrigger className="contents">
                <SpaceList {...props}>
                  <SpaceIcon name={space.icon} />
                  <span className="truncate font-medium">{space.name}</span>
                  {/* The pop-up button's sign: one of several, click to choose. */}
                  <ChevronsUpDown aria-hidden className="ml-auto size-3.5! text-sidebar-foreground/45" />
                </SpaceList>
              </ContextMenuTrigger>
              <SidebarMenuPopup className="min-w-44">
                <ContextMenuEntries
                  groups={spaceMenu(space, props, {
                    rename: () => props.onRenamingChange(space.id),
                    changeIcon: () => setIconPickerOpen(true),
                    // An empty space has nothing to lose: no question then.
                    delete: () => (spaceTabs(space).length === 0 && space.items.length === 0 ? props.onDelete(space.id, null) : setConfirmDelete(true)),
                  })}
                />
              </SidebarMenuPopup>
            </ContextMenu>
          )}
          <IconPicker
            open={iconPickerOpen}
            onOpenChange={setIconPickerOpen}
            current={space.icon}
            onPick={(icon) => {
              setIconPickerOpen(false)
              if (icon !== space.icon) props.onChangeIcon(space.id, icon)
            }}
          />
        </SidebarMenuItem>
      </SidebarMenu>
      {/* Keyed: each opening starts from the default target. */}
      <DeleteSpaceAlert
        key={`${space.id}-${confirmDelete}`}
        space={space}
        spaces={spaces}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onDelete={(moveTo) => {
          setConfirmDelete(false)
          props.onDelete(space.id, moveTo)
        }}
      />
    </SidebarGroup>
  )
}

/** The title button and the list it pops up. */
function SpaceList({
  spaces,
  activeSpaceId,
  onSelect,
  onCreate,
  listOpen,
  onListOpenChange,
  dropSpaceId,
  children,
}: SpaceSwitcherProps & { children: ReactNode }) {
  const active = spaces.find((s) => s.id === activeSpaceId)
  return (
    // Not modal: a tab can be dragged into the open list, and the sidebar stays usable.
    <DropdownMenu open={listOpen} onOpenChange={onListOpenChange} modal={false}>
      <DropdownMenuTrigger
        render={
          // A click only ever opens the list (a pop-up button); renaming is in the space's menu.
          <SidebarMenuButton aria-label={`Space: ${active?.name ?? ""}. Choose a space`} />
        }
      >
        {children}
      </DropdownMenuTrigger>
      {/* As wide as the title and below it: inside the sidebar, where the website doesn't cover it. */}
      <DropdownMenuContent sideOffset={4}>
        <DropdownMenuRadioGroup value={activeSpaceId} onValueChange={(id: Id) => id !== activeSpaceId && onSelect(id)}>
          {spaces.map((space) => (
            <SpaceRow key={space.id} space={space} dropTarget={space.id === dropSpaceId} />
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCreate}>
          <Plus aria-hidden />
          {menuLabel("spaces", "newSpace")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A space's lucide icon by name (decorative: the name is always next to it or in the label). */
function SpaceIcon({ name, className }: { name: string; className?: string }) {
  return createElement(spaceIcon(name), { "aria-hidden": true, className })
}

/** Up to four pinned favicons: the space's "palette", so it's recognisable before reading. */
const PALETTE_SIZE = 4

function spaceTabs(space: Space): Tab[] {
  const pinned = space.items.flatMap((item) => (item.kind === "tab" ? [item.tab] : item.folder.tabs))
  return [...pinned, ...space.tempTabs]
}

function SpaceRow({ space, dropTarget }: { space: Space; dropTarget: boolean }) {
  // A dragged tab resting here switches to this space (spring-loading, see useTabDrag).
  const { setNodeRef } = useTabDropZone(`space-${space.id}`, { kind: "space", spaceId: space.id })
  const palette = space.items
    .flatMap((item) => (item.kind === "tab" ? [item.tab] : item.folder.tabs))
    .slice(0, PALETTE_SIZE)

  return (
    <DropdownMenuRadioItem ref={setNodeRef} value={space.id} className={cn(dropTarget && "bg-accent text-accent-foreground")}>
      <SpaceIcon name={space.icon} />
      <span className="truncate">{space.name}</span>
      {palette.length > 0 && (
        <span aria-hidden className="ml-auto flex shrink-0 -space-x-1">
          {palette.map((tab) => (
            <Favicon key={tab.id} src={tab.favicon} className="size-3.5 ring-2 ring-popover" />
          ))}
        </span>
      )}
    </DropdownMenuRadioItem>
  )
}

/** The space's right-click menu, in the catalog's order. Items that don't apply are left out. */
function spaceMenu(
  space: Space,
  { spaces, shownTabId, onMove, onUnload }: SpaceSwitcherProps,
  open: { rename: () => void; changeIcon: () => void; delete: () => void },
): MenuGroups {
  const index = spaces.findIndex((s) => s.id === space.id)
  const unloadable = spaceTabs(space).some((tab) => tab.isLoaded && tab.id !== shownTabId)
  return [
    [
      { label: menuLabel("space", "rename"), onSelect: open.rename },
      { label: menuLabel("space", "changeIcon"), onSelect: open.changeIcon },
    ],
    [
      ...(index > 0 ? [{ label: menuLabel("space", "moveUp"), onSelect: () => onMove(space.id, index - 1) }] : []),
      ...(index < spaces.length - 1
        ? [{ label: menuLabel("space", "moveDown"), onSelect: () => onMove(space.id, index + 1) }]
        : []),
      ...(unloadable ? [{ label: menuLabel("space", "unload"), onSelect: () => onUnload(space.id) }] : []),
    ],
    // The last space can't go (the backend refuses), so it isn't offered.
    spaces.length > 1 ? [{ label: menuLabel("space", "delete"), onSelect: open.delete, destructive: true }] : [],
  ]
}

/** A grid of icons under the title. Picking one applies it and closes (HIG popovers.md). */
function IconPicker({
  open,
  onOpenChange,
  current,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: string
  onPick: (icon: string) => void
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {/* Opened from the space's menu, not by clicking: the trigger only anchors it to the title. */}
      <PopoverTrigger
        nativeButton={false}
        render={<span aria-hidden tabIndex={-1} className="pointer-events-none absolute inset-0" />}
      />
      {/* Start-aligned under the title and no wider than the sidebar, so the website never covers it. */}
      <PopoverContent align="start" className="w-(--anchor-width) gap-2 rounded-xl p-2">
        <div role="radiogroup" aria-label="Space icon" className="grid grid-cols-6 gap-0.5">
          {SPACE_ICON_NAMES.map((name) => {
            const selected = name === current
            return (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={name.replace(/-/g, " ")}
                title={name.replace(/-/g, " ")}
                onClick={() => onPick(name)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-md text-popover-foreground/70 outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "bg-accent text-accent-foreground",
                )}
              >
                <SpaceIcon name={name} className="size-4" />
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Deleting a space with tabs asks first (HIG alerts.md: uncommon, and its tabs are at stake), and
 * asks what happens to them: they move to another space (the default, nothing is lost) or close
 * with it. An empty space goes without a question.
 */
function DeleteSpaceAlert({
  space,
  spaces,
  open,
  onOpenChange,
  onDelete,
}: {
  space: Space
  spaces: Space[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (moveTo: Id | null) => void
}) {
  const others = spaces.filter((s) => s.id !== space.id)
  // The space that shows next (the one before it, or after the first): where its tabs go by default.
  const index = spaces.findIndex((s) => s.id === space.id)
  const neighbour = spaces[index === 0 ? 1 : index - 1] ?? others[0]
  const [targetId, setTargetId] = useState<Id | null>(null)
  const target = others.find((s) => s.id === targetId) ?? neighbour
  const tabCount = spaceTabs(space).length
  const folderCount = space.items.filter((item) => item.kind === "folder").length
  const contents = [
    tabCount > 0 && `${tabCount} ${tabCount === 1 ? "tab" : "tabs"}`,
    folderCount > 0 && `${folderCount} ${folderCount === 1 ? "folder" : "folders"}`,
  ].filter(Boolean)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* The default size: three buttons in one row. */}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{space.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Its {contents.join(" and ")} can move to another space, or close with it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {others.length > 1 && target && (
          // A pop-up button: which space gets them (HIG pop-up-buttons.md).
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Move them to</span>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                <SpaceIcon name={target.icon} className="size-4 shrink-0" />
                <span className="truncate">{target.name}</span>
                <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-40">
                <DropdownMenuRadioGroup value={target.id} onValueChange={(id: Id) => setTargetId(id)}>
                  {others.map((s) => (
                    <DropdownMenuRadioItem key={s.id} value={s.id}>
                      <SpaceIcon name={s.icon} />
                      <span className="truncate">{s.name}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {/* Closing loses the tabs (Ctrl+Shift+T can still bring them back): not the default. */}
          <AlertDialogAction variant="outline" onClick={() => onDelete(null)}>
            Close Tabs
          </AlertDialogAction>
          {target && (
            <AlertDialogAction onClick={() => onDelete(target.id)}>
              {others.length > 1 ? "Move and Delete" : `Move to “${target.name}”`}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
