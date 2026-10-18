import type { Transition } from "motion/react"

/** The titlebar peek's timing (`duration-150 ease-in-out`), for motion animations elsewhere. */
export const PEEK_TRANSITION: Transition = { duration: 0.15, ease: "easeInOut" }

/** Use when prefers-reduced-motion is set: changes apply immediately. */
export const INSTANT: Transition = { duration: 0 }
