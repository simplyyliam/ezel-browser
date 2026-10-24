import { useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { reachesOverPage, useContentCutout } from "../../content-cutout"
import { DURATION, EASE_OUT, INSTANT, SPRING } from "../../motion"
import { useToast, type ToastMessage } from "../../toast"
import { Pill } from "../pill/pill"

/**
 * Draws `showToast` messages: a small pill at the bottom-left, inside the sidebar's width and just
 * above its footer, whether the sidebar is docked or peeking. The website is drawn over the UI, so
 * the pill is cut out of it while it shows (nothing may float past the sidebar's right edge).
 * Mount once (AppLayout).
 */
export function Toaster() {
  const toast = useToast()
  return (
    // Always in the DOM, so screen readers hear each new message.
    <div role="status" aria-live="polite" data-toast-spot className={TOAST_SPOT}>
      <AnimatePresence>{toast && <ToastPill key={toast.key} title={toast.title} detail={toast.detail} tone={toast.tone} />}</AnimatePresence>
    </div>
  )
}

/** Where toasts show: bottom-left, inside the sidebar's width, just above its footer. */
const TOAST_SPOT = "pointer-events-none fixed bottom-[52px] left-3.5 z-50"

/**
 * A toast's entrance and exit, for `Pill`: rises a few px and settles, like a note set down;
 * leaves faster than it came (decisions.md).
 * `still` (over the page): no motion at all. There the pill shows only through a hole cut in the
 * website, and a hole can't fade or scale: the pill animated inside a dark, fixed box.
 */
function toastMotion(reduced: boolean, still: boolean) {
  if (still) return { initial: false as const, exit: { opacity: 0, transition: INSTANT } }
  return {
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: reduced ? { opacity: 0 } : { opacity: 0, y: 2, scale: 0.98, transition: { duration: DURATION.fast, ease: "easeIn" as const } },
    transition: reduced ? INSTANT : SPRING,
  }
}

/**
 * True when the toast spot lies over the page right now (the sidebar collapsed, not peeking), read
 * once when a pill mounts: it then shows and hides in one piece (see `toastMotion`).
 */
function useOverPage() {
  const [over] = useState(() => {
    const spot = document.querySelector("[data-toast-spot]")
    return !!spot && reachesOverPage(spot)
  })
  return over
}

function ToastPill({ title, detail, tone }: ToastMessage) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const still = useOverPage()
  // Exactly the pill: its outline is inside it.
  useContentCutout("toast", () => ref.current)

  return (
    <Pill
      ref={ref}
      {...toastMotion(!!reduced, still)}
      // The check sits closer to the edge than text would.
      className={cn("max-w-[216px] origin-bottom-left", tone === "done" && "pl-1.5")}
    >
      {tone === "done" && <DrawnCheck reduced={!!reduced} />}
      <span className="shrink-0 font-medium">{title}</span>
      {detail && <span className="min-w-0 truncate text-muted-foreground">{detail}</span>}
    </Pill>
  )
}

/** A check that draws itself once the pill has landed: the one moment of motion that says "done". */
function DrawnCheck({ reduced }: { reduced: boolean }) {
  return (
    <span aria-hidden className="grid size-4 shrink-0 place-items-center rounded-full bg-foreground text-background">
      <svg viewBox="0 0 24 24" className="size-2.5" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
        <motion.path
          d="M20 6 9 17l-5-5"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={reduced ? INSTANT : { duration: 0.22, delay: 0.08, ease: EASE_OUT }}
        />
      </svg>
    </span>
  )
}
