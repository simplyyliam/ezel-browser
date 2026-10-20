import { useRef } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useContentCutout } from "../../content-cutout"
import { INSTANT } from "../../motion"
import { useToast, type ToastMessage } from "../../toast"

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
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-[52px] left-3.5 z-50">
      <AnimatePresence>{toast && <ToastPill key={toast.key} title={toast.title} detail={toast.detail} tone={toast.tone} />}</AnimatePresence>
    </div>
  )
}

function ToastPill({ title, detail, tone }: ToastMessage) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  // 1px for the ring, drawn just outside the pill.
  useContentCutout("toast", () => ref.current, 1)

  return (
    <motion.div
      ref={ref}
      // Rises a few px and settles, like a note set down; leaves faster than it came (decisions.md).
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 2, scale: 0.98, transition: { duration: 0.12, ease: "easeIn" } }}
      transition={reduced ? INSTANT : { type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
      className="flex max-w-[216px] origin-bottom-left items-center gap-1.5 rounded-full bg-popover py-1 pr-2.5 pl-1.5 text-xs text-popover-foreground ring-1 ring-foreground/10"
    >
      {tone === "done" && <DrawnCheck reduced={!!reduced} />}
      <span className="shrink-0 font-medium">{title}</span>
      {detail && <span className="min-w-0 truncate text-muted-foreground">{detail}</span>}
    </motion.div>
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
          transition={reduced ? INSTANT : { duration: 0.22, delay: 0.08, ease: "easeOut" }}
        />
      </svg>
    </span>
  )
}
