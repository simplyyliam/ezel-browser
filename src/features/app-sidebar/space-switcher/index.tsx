import { useState, type ReactNode } from "react"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import {
  SidebarGroup,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { INSTANT, PEEK_TRANSITION, spaceIcon, useTabDropZone, type Id, type Space } from "@/shared"

type SpaceSwitcherProps = {
  spaces: Space[]
  activeSpaceId: Id
  onSelect: (spaceId: Id) => void
  /** The space whose name is being edited inline, if any. Double-clicking the active pill starts it. */
  renamingSpaceId: Id | null
  onRenamingChange: (spaceId: Id | null) => void
  onRename: (spaceId: Id, name: string) => void
  /** A dragged tab hovers this space's pill: it switches to it after a moment. */
  dropSpaceId: Id | null
}

/** The active space is a pill with its name; the others collapse to icon-only buttons beside it. */
export function SpaceSwitcher({
  spaces,
  activeSpaceId,
  onSelect,
  renamingSpaceId,
  onRenamingChange,
  onRename,
  dropSpaceId,
}: SpaceSwitcherProps) {
  const reduceMotion = useReducedMotion()
  const transition = reduceMotion ? INSTANT : PEEK_TRANSITION

  return (
    <SidebarGroup>
      <LayoutGroup>
        <SidebarMenu role="group" aria-label="Spaces" className="flex-row gap-1.5">
          {spaces.map((space) => {
            const active = space.id === activeSpaceId
            const Icon = spaceIcon(space.icon)
            if (space.id === renamingSpaceId) {
              return (
                <SidebarMenuItem key={space.id}>
                  <RenameInput
                    name={space.name}
                    onDone={(name) => {
                      if (name && name !== space.name) onRename(space.id, name)
                      onRenamingChange(null)
                    }}
                  />
                </SidebarMenuItem>
              )
            }
            return (
              <SpaceItem key={space.id} spaceId={space.id}>
                <SidebarMenuButton
                  render={<motion.button layout="position" transition={transition} />}
                  size="sm"
                  isActive={active}
                  aria-label={space.name}
                  aria-pressed={active}
                  title={active ? "Double-click to rename" : space.name}
                  onClick={active ? undefined : () => onSelect(space.id)}
                  onDoubleClick={active ? () => onRenamingChange(space.id) : undefined}
                  // No gap: the name brings its own padding, so collapsed buttons stay square.
                  className={cn(
                    "w-auto min-w-7 justify-center gap-0 bg-sidebar-foreground/5 px-1.5 hover:bg-sidebar-foreground/8 data-active:bg-sidebar-foreground/5",
                    space.id === dropSpaceId && "bg-sidebar-foreground/12",
                  )}
                >
                  <Icon aria-hidden className="size-3.5" />
                  {/* Expanding the new name and collapsing the old one run at the same time. */}
                  <AnimatePresence initial={false}>
                    {active && (
                      <motion.span
                        key="name"
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: "auto", opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={transition}
                        className="overflow-hidden whitespace-nowrap"
                      >
                        <span className="block pr-0.5 pl-1.5">{space.name}</span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </SidebarMenuButton>
              </SpaceItem>
            )
          })}
        </SidebarMenu>
      </LayoutGroup>
    </SidebarGroup>
  )
}

/** A pill's menu item; a tab dragged over it can switch to the space. */
function SpaceItem({ spaceId, children }: { spaceId: Id; children: ReactNode }) {
  const { setNodeRef } = useTabDropZone(`space-${spaceId}`, { kind: "space", spaceId })
  return <SidebarMenuItem ref={setNodeRef}>{children}</SidebarMenuItem>
}

/** Enter or blur saves (trimmed; empty keeps the old name), Escape cancels. */
function RenameInput({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(name)
  // Enter/Escape blur the input, which would report a second time.
  const [done, setDone] = useState(false)
  const finish = (result: string | null) => {
    if (done) return
    setDone(true)
    onDone(result)
  }

  return (
    <SidebarInput
      aria-label="Space name"
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      value={value}
      maxLength={40}
      spellCheck={false}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(value.trim())}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(value.trim())
        else if (event.key === "Escape") finish(null)
      }}
      className="h-7 w-32 px-2"
    />
  )
}
