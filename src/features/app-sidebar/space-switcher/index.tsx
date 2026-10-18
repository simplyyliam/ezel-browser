import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"
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
    <LayoutGroup>
      <div role="group" aria-label="Spaces" className="flex items-center gap-1">
        {spaces.map((space) => {
          const active = space.id === activeSpaceId
          const Icon = space.icon
          return (
            <motion.button
              key={space.id}
              type="button"
              layout="position"
              transition={transition}
              aria-label={space.name}
              aria-pressed={active}
              onClick={() => onSelect(space.id)}
              className={cn(
                "flex h-[15px] min-w-[15px] items-center justify-center rounded-[5px] bg-sidebar-foreground/5 px-[3px] text-sidebar-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                !active && "hover:bg-sidebar-foreground/8",
              )}
            >
              <Icon aria-hidden className="size-[9px] shrink-0" />
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
                    <span className="block pr-0.5 pl-1 text-[9px] leading-none">{space.name}</span>
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )
        })}
      </div>
    </LayoutGroup>
  )
}
