import { useRef, type KeyboardEvent } from "react"
import { motion } from "motion/react"
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ContextMenuEntries, routeContextMenu, SidebarMenuPopup, SpaceIcon, type MenuGroups } from "@/shared/components"
import { FOLLOW, useTabDropZone, type Id, type Space } from "@/shared"

// The spaces, as small icons in the middle of the sidebar's footer (v0.3.1), where Zen and Arc
// keep theirs: the familiar place, so nobody has to look for it. Kept small and quiet: 14px icons
// in 22px targets, the others at 55% until hovered; the shown space sits on a soft pill that
// glides to the next one when the space changes (however it changed: a click, the title's list,
// a swipe). The name shows on hover; right-click is the space's menu; a tab held on an icon
// switches there (spring-loading). Many spaces scroll sideways inside the footer's middle.

type SpaceDockProps = {
  spaces: Space[]
  activeSpaceId: Id
  onSelect: (spaceId: Id) => void
  /** A space's right-click menu, built when it opens. */
  menuFor: (spaceId: Id) => MenuGroups
  /** The space a dragged tab rests on: it switches there in a moment. */
  dropSpaceId: Id | null
}

export function SpaceDock({ spaces, activeSpaceId, onSelect, menuFor, dropSpaceId }: SpaceDockProps) {
  const ref = useRef<HTMLDivElement>(null)
  if (spaces.length < 2) return null

  // Left and right walk the spaces, as a tab list's keys do.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    const index = spaces.findIndex((s) => s.id === activeSpaceId)
    const next = spaces[(index + (event.key === "ArrowRight" ? 1 : spaces.length - 1)) % spaces.length]
    if (!next) return
    onSelect(next.id)
    ref.current?.querySelector<HTMLElement>(`[data-space-id="${next.id}"]`)?.focus()
  }

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label="Spaces"
      onKeyDown={onKeyDown}
      className="no-scrollbar flex min-w-0 items-center gap-px overflow-x-auto"
    >
      {spaces.map((space) => (
        <SpaceIconButton
          key={space.id}
          space={space}
          active={space.id === activeSpaceId}
          dropTarget={space.id === dropSpaceId}
          onSelect={() => onSelect(space.id)}
          menu={() => menuFor(space.id)}
        />
      ))}
    </div>
  )
}

function SpaceIconButton({
  space,
  active,
  dropTarget,
  onSelect,
  menu,
}: {
  space: Space
  active: boolean
  dropTarget: boolean
  onSelect: () => void
  menu: () => MenuGroups
}) {
  // A dragged tab resting here switches to this space (spring-loading, see useTabDrag).
  const { setNodeRef } = useTabDropZone(`space-${space.id}`, { kind: "space", spaceId: space.id })

  return (
    <ContextMenu>
      <ContextMenuTrigger className="contents" onContextMenu={routeContextMenu}>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                ref={setNodeRef}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={space.name}
                // Only the shown space is in the tab order; arrows move between them.
                tabIndex={active ? 0 : -1}
                data-space-id={space.id}
                onClick={onSelect}
                className={cn(
                  "relative grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-md outline-none transition-[opacity,background-color] duration-(--motion-fast) ease-ezel-out focus-visible:ring-2 focus-visible:ring-sidebar-ring motion-reduce:transition-none",
                  active ? "opacity-100" : "opacity-55 hover:bg-sidebar-foreground/8 hover:opacity-100",
                  dropTarget && "bg-sidebar-foreground/12 opacity-100",
                )}
              />
            }
          >
            {/* The shown space's pill: one element that glides between icons (shared layout). */}
            {active && <motion.span layoutId="space-dock-pill" transition={FOLLOW} className="absolute inset-0 rounded-md bg-sidebar-foreground/12" />}
            <SpaceIcon icon={space.icon} className="relative size-3.5 text-[0.8125rem]" />
          </TooltipTrigger>
          <TooltipContent side="top">{space.name}</TooltipContent>
        </Tooltip>
      </ContextMenuTrigger>
      <SidebarMenuPopup className="min-w-44">
        <ContextMenuEntries groups={menu()} />
      </SidebarMenuPopup>
    </ContextMenu>
  )
}
