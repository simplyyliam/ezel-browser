import { useState } from "react"
import { Lock, LockOpen, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { SECURITY_COPY, splitHost, type PageSecurity } from "@/shared"

type SiteButtonProps = {
  host: string
  security: PageSecurity
  open: boolean
  onToggle: () => void
}

/** The lock, or a warning for HTTP and certificate problems. */
function SecurityIcon({ security, className }: { security: PageSecurity; className?: string }) {
  if (security === "certificateError") return <ShieldAlert aria-hidden className={cn("text-destructive", className)} />
  if (security === "notSecure") return <LockOpen aria-hidden className={cn("text-amber-600 dark:text-amber-400", className)} />
  return <Lock aria-hidden className={cn("text-muted-foreground", className)} />
}

const SECURITY_LABEL: Record<PageSecurity, string> = {
  none: "",
  secure: "Secure connection",
  notSecure: "Not secure",
  certificateError: "Certificate problem",
}

/**
 * The middle of the titlebar peek: which site this is, which the page can't fake with its title.
 * Only the registrable domain is strong ("www." and the like stay quiet). A click opens the site
 * info panel.
 */
export function SiteButton({ host, security, open, onToggle }: SiteButtonProps) {
  const { prefix, domain } = splitHost(host)
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${host}, ${SECURITY_LABEL[security]}. Site information`}
      onClick={onToggle}
      className={cn(
        "flex h-7 min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
        open && "bg-muted",
      )}
    >
      <SecurityIcon security={security} className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">
        <span className="text-muted-foreground">{prefix}</span>
        <span className="font-medium text-foreground">{domain}</span>
      </span>
      {security !== "secure" && (
        <span className={cn("shrink-0", security === "certificateError" ? "text-destructive" : "text-muted-foreground")}>
          {SECURITY_LABEL[security]}
        </span>
      )}
    </button>
  )
}

type SiteInfoPanelProps = {
  host: string
  security: PageSecurity
  onClearData: () => void
}

/**
 * The site info panel, inside the titlebar peek under the domain (the bar grows to hold it, so
 * it's cut out of the page with the bar). Connection and certificate status, then what can be
 * done about the site. Clearing signs people out of it, so it asks once, in place (HIG: confirm
 * what can't be undone, without an alert for a small thing).
 */
export function SiteInfoPanel({ host, security, onClearData }: SiteInfoPanelProps) {
  const copy = SECURITY_COPY[security]
  const [confirming, setConfirming] = useState(false)
  const action =
    "rounded-md px-2 py-1 font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
  return (
    <section aria-label={`About ${host}`} className="mx-auto mb-2 flex w-72 max-w-[calc(100%-1rem)] flex-col gap-3 rounded-xl bg-muted/60 p-3 text-xs">
      <div className="flex items-start gap-2">
        <SecurityIcon security={security} className="mt-px size-4 shrink-0" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate font-medium text-foreground">{host}</p>
          {copy && (
            <>
              <p className={cn("font-medium", security === "certificateError" ? "text-destructive" : "text-foreground")}>
                {copy.title}
              </p>
              <p className="text-muted-foreground">{copy.detail}</p>
            </>
          )}
        </div>
      </div>
      {confirming ? (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground">This signs you out of {splitHost(host).domain} and removes what it saved here.</p>
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => setConfirming(false)} className={cn(action, "text-foreground hover:bg-background")}>
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => {
                setConfirming(false)
                onClearData()
              }}
              className={cn(action, "bg-foreground text-background hover:bg-foreground/90")}
            >
              Clear Data
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={cn(action, "self-start text-foreground ring-1 ring-foreground/10 hover:bg-background")}>
          Clear This Site's Data…
        </button>
      )}
    </section>
  )
}
