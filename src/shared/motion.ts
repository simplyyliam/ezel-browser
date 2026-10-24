import type { Transition } from "motion/react"

// Ezel's motion tokens (docs/design/decisions.md, "Motion tokens"): every animation picks one of
// these, so every detail moves like the same app. The CSS side is index.css's `--motion-*`
// durations and `ease-ezel-*` easings; keep the two in step.

/** Seconds. Fast: things appearing (fast in). Base: the titlebar peek, state changes. Slow: things leaving (slower out). */
export const DURATION = { fast: 0.12, base: 0.15, slow: 0.3 } as const

/** Settles quickly without overshoot: enters and exits (`ease-ezel-out`). */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const

/** Both ends soft: things moving from one place to another (`ease-ezel-in-out`, Tailwind's ease-in-out). */
export const EASE_IN_OUT = [0.4, 0, 0.2, 1] as const

/** Appearing: fast and settling. */
export const ENTER: Transition = { duration: DURATION.fast, ease: EASE_OUT }

/** Leaving: slower, so it doesn't flicker. */
export const EXIT: Transition = { duration: DURATION.slow, ease: EASE_OUT }

/** The titlebar peek's timing (`duration-150 ease-in-out`), for motion animations elsewhere. */
export const PEEK_TRANSITION: Transition = { duration: DURATION.base, ease: EASE_IN_OUT }

/**
 * Physical feedback (following or answering the hand: unfolding, settling): a gentle spring that
 * overshoots a little. Duration-based, so it ends on time like the rest.
 */
export const SPRING: Transition = { type: "spring", duration: 0.35, bounce: 0.15 }

/** Following the hand closely (a highlight tracking the arrow keys): stiff, no visible bounce. */
export const FOLLOW: Transition = { type: "spring", stiffness: 700, damping: 45, mass: 0.6 }

/** Use when prefers-reduced-motion is set: changes apply immediately. */
export const INSTANT: Transition = { duration: 0 }
