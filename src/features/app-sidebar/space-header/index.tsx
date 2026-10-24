import { ChevronRight } from "lucide-react"
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu"
import { SidebarGroup } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { ContextMenuEntries, NameField, routeContextMenu, SidebarMenuPopup, SpaceIcon, type MenuGroups } from "@/shared/components"
import { useTabDropZone, type Id, type Space } from "@/shared"
import { DeleteSpaceAlert } from "./delete-alert"
import { IconPicker } from "./icon-picker"

// The shown space's title row (v0.3.1): small and quiet, a label over its pinned tabs.
//
//   [icon] Name ›
//
// - The whole row is one button that folds the space (HIG disclosure-controls.md): a click folds
//   the pinned list away, another brings it back; nothing shows under a folded space. A small
//   chevron after the name says so: it shows on hover and stays while folded.
// - Switching lives in the footer's space icons (features/app-sidebar/space-dock) and a
//   two-finger swipe over the sidebar (the widget), not here.
// - The icon and the name sit on the tab rows' columns: the icon over their favicons, the name
//   over their titles.
// - Right-click anywhere on the row is the space's menu (built by the widget); the icon picker
//   and the delete question open here.
// Everything stays inside the sidebar's width: the website covers anything beyond it.

type SpaceHeaderProps = {
  space: Space
  spaces: Space[]
  onToggleCollapsed: () => void
  /** A space's right-click menu, built when it opens. */
  menuFor: (spaceId: Id) => MenuGroups
  /** The title is a field ("Rename Space…", and every new space). */
  renaming: boolean
  /** The typed name; null (Escape) or the same name keeps the old one. */
  onRenameDone: (name: string | null) => void
  iconPickerOpen: boolean
  onIconPickerOpenChange: (open: boolean) => void
  onPickIcon: (icon: string) => void
  /** Delete Space… asks here first (a space with tabs or folders). */
  deleting: boolean
  onDeletingChange: (open: boolean) => void
  /** `moveTo`: the space that takes its tabs and folders; null closes them with it. */
  onDelete: (moveTo: Id | null) => void
}

export function SpaceHeader(props: SpaceHeaderProps) {
  const { space, spaces, renaming } = props
  // Resting a dragged tab on the title opens a folded space (spring-loading).
  const { setNodeRef } = useTabDropZone("spaces", { kind: "spaces" })
  const foldable = space.items.length > 0
  const folded = foldable && space.collapsed

  return (
    <SidebarGroup className="py-1">
      <div ref={setNodeRef} className="relative flex h-7 items-center">
        {renaming ? (
          <NameField
            name={space.name}
            label="Space name"
            maxLength={40}
            icon={<SpaceIcon icon={space.icon} />}
            onDone={(name) => props.onRenameDone(name && name !== space.name ? name : null)}
          />
        ) : (
          <ContextMenu>
            <ContextMenuTrigger className="contents" onContextMenu={routeContextMenu}>
              <FoldButton space={space} foldable={foldable} folded={folded} onToggle={props.onToggleCollapsed} />
            </ContextMenuTrigger>
            <SidebarMenuPopup className="min-w-44">
              <ContextMenuEntries groups={props.menuFor(space.id)} />
            </SidebarMenuPopup>
          </ContextMenu>
        )}
        <IconPicker open={props.iconPickerOpen} onOpenChange={props.onIconPickerOpenChange} current={space.icon} onPick={props.onPickIcon} />
      </div>
      {/* Keyed: each opening starts from the default target. */}
      <DeleteSpaceAlert
        key={`${space.id}-${props.deleting}`}
        space={space}
        spaces={spaces}
        open={props.deleting}
        onOpenChange={props.onDeletingChange}
        onDelete={props.onDelete}
      />
    </SidebarGroup>
  )
}

/**
 * The title as one button that folds the space. A space with nothing pinned has nothing to fold,
 * so its title is just a label.
 */
function FoldButton({ space, foldable, folded, onToggle }: { space: Space; foldable: boolean; folded: boolean; onToggle: () => void }) {
  // Same box as a tab row's (SidebarMenuButton: px-2, gap-2, a 16px icon), so the columns line up.
  const row = "flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-[13px] font-medium text-sidebar-foreground/85"
  const label = (
    <>
      <SpaceIcon icon={space.icon} />
      <span className="truncate">{space.name}</span>
    </>
  )
  if (!foldable) return <div className={row}>{label}</div>
  return (
    <button
      type="button"
      aria-expanded={!folded}
      aria-label={folded ? `Expand ${space.name}` : `Collapse ${space.name}`}
      onClick={onToggle}
      className={cn(row, "group/fold cursor-pointer outline-none hover:bg-sidebar-foreground/8 focus-visible:ring-2 focus-visible:ring-sidebar-ring")}
    >
      {label}
      <ChevronRight
        aria-hidden
        className={cn(
          "ml-auto size-3 shrink-0 text-sidebar-foreground/45 transition-[opacity,rotate] duration-(--motion-fast) ease-ezel-out motion-reduce:transition-none",
          folded ? "opacity-100" : "rotate-90 opacity-0 group-hover/fold:opacity-100 group-focus-visible/fold:opacity-100",
        )}
      />
    </button>
  )
}
