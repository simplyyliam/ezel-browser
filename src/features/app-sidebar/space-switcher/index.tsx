import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { INSTANT, PEEK_TRANSITION, type Space } from "@/shared"

type SpaceSwitcherProps = {
  spaces: Space[]
  activeSpaceId: string
  onSelect: (spaceId: string) => void
}

/** The active space is a pill with its name; the others collapse to icon-only buttons beside it. */
export function SpaceSwitcher({ spaces, activeSpaceId, onSelect }: SpaceSwitcherProps) {
  const reduceMotion = useReducedMotion()
  const transition = reduceMotion ? INSTANT : PEEK_TRANSITION

  return (
    <SidebarGroup>
      <LayoutGroup>
        <SidebarMenu role="group" aria-label="Spaces" className="flex-row gap-1.5">
          {spaces.map((space) => {
            const active = space.id === activeSpaceId
            const Icon = space.icon
            return (
              <SidebarMenuItem key={space.id}>
                <SidebarMenuButton
                  render={<motion.button layout="position" transition={transition} />}
                  size="sm"
                  isActive={active}
                  aria-label={space.name}
                  aria-pressed={active}
                  onClick={() => onSelect(space.id)}
                  // No gap: the name brings its own padding, so collapsed buttons stay square.
                  className="w-auto min-w-7 justify-center gap-0 bg-sidebar-foreground/5 px-1.5 hover:bg-sidebar-foreground/8 data-active:bg-sidebar-foreground/5"
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
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </LayoutGroup>
    </SidebarGroup>
  )
}
