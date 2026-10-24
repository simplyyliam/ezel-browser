import { Clock, PlugZap, SearchX, ShieldAlert, Unplug, WifiOff, type LucideIcon } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"
import { DURATION, EASE_OUT, splitHost, type PageError } from "@/shared"

type ErrorPageProps = {
  error: PageError
  /** The page's host, shown as the site the problem is about. */
  host: string | null
  canGoBack: boolean
  onTryAgain: () => void
  onChangeAddress: () => void
  onGoBack: () => void
}

type Copy = { icon: LucideIcon; title: string; body: string; action: "tryAgain" | "goBack" }

/** What happened and what to do, in Ezel's plain voice (HIG writing.md: no blame, one next step). */
function copyFor(error: PageError, site: string): Copy {
  switch (error) {
    case "offline":
      return { icon: WifiOff, title: "You're offline", body: "Ezel can't reach the internet. Check your Wi-Fi or cable, then try again.", action: "tryAgain" }
    case "notFound":
      return { icon: SearchX, title: `Can't find ${site}`, body: "The address may have a typo, or the site may be gone. Check it, or try again if you just went offline.", action: "tryAgain" }
    case "cantConnect":
      return { icon: Unplug, title: `${site} isn't answering`, body: "The site may be down or busy. Try again in a moment.", action: "tryAgain" }
    case "timedOut":
      return { icon: Clock, title: `${site} took too long`, body: "It didn't answer in time. Try again in a moment.", action: "tryAgain" }
    case "certificate":
      return {
        icon: ShieldAlert,
        title: "This connection isn't private",
        body: `Ezel couldn't confirm this is the real ${site}, so it stopped before loading anything. Someone may be pretending to be it.`,
        action: "goBack",
      }
    case "crashed":
      return { icon: PlugZap, title: "This page stopped working", body: "Something in it made it quit. Reloading usually brings it back.", action: "tryAgain" }
  }
}

const buttonBase =
  "rounded-lg px-3 py-1.5 text-sm font-medium outline-none transition-colors duration-(--motion-base) focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"

/**
 * Ezel's own page when a site can't be shown: an empty canvas on the easel, one plain sentence and
 * one action (docs/design/decisions.md, "The site speaks from the peek"). It sits where the
 * website would be; the website's webview is hidden meanwhile. SmartScreen's warnings never come
 * here (Rust leaves those to WebView2).
 */
export function ErrorPage({ error, host, canGoBack, onTryAgain, onChangeAddress, onGoBack }: ErrorPageProps) {
  const reduced = useReducedMotion()
  const site = host ? splitHost(host).domain : "this site"
  const { icon: Icon, title, body, action } = copyFor(error, site)
  const primary =
    action === "goBack" && canGoBack
      ? { label: "Go Back", onClick: onGoBack }
      : { label: error === "crashed" ? "Reload" : "Try Again", onClick: onTryAgain }

  return (
    <div role="alert" className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-background p-6">
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.base, ease: EASE_OUT }}
        className="flex max-w-sm flex-col items-center gap-4 text-center"
      >
        {/* The blank canvas: a frame with nothing painted yet, the problem's sign in its middle. */}
        <div aria-hidden className="flex flex-col items-center">
          <div className="flex h-16 w-20 items-center justify-center rounded-xl bg-muted/40 ring-1 ring-foreground/10">
            <Icon className={cn("size-6", error === "certificate" ? "text-destructive" : "text-muted-foreground")} />
          </div>
          {/* The easel's legs. */}
          <svg viewBox="0 0 80 14" className="h-3.5 w-20 text-foreground/15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M26 0 18 14M54 0l8 14M40 0v10" />
          </svg>
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-base font-semibold text-balance text-foreground">{title}</h1>
          <p className="text-sm text-pretty text-muted-foreground">{body}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" autoFocus onClick={primary.onClick} className={cn(buttonBase, "bg-foreground text-background hover:bg-foreground/90")}>
            {primary.label}
          </button>
          {(error === "notFound" || error === "certificate") && (
            <button type="button" onClick={onChangeAddress} className={cn(buttonBase, "text-foreground ring-1 ring-foreground/10 hover:bg-muted")}>
              Change Address…
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
