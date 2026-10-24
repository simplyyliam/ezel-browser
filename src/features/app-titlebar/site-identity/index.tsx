import { useState } from "react"
import { Camera, Clipboard, Lock, LockOpen, MapPin, Mic, ShieldAlert, X, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  PERMISSION_ASKS,
  PERMISSION_NAMES,
  SECURITY_COPY,
  splitHost,
  type PageSecurity,
  type PermissionAsked,
  type SitePermission,
  type SitePermissions,
} from "@/shared"

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
        "flex h-7 min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs outline-none transition-colors duration-(--motion-base) hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
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
  /** This site's remembered permissions, if any. */
  permissions: SitePermissions | null
  onRevoke: (permission: SitePermission) => void
  /** Opens the list of every site's permissions. */
  onManageAll: () => void
}

const PERMISSION_ICONS: Record<SitePermission, LucideIcon> = { camera: Camera, microphone: Mic, location: MapPin, clipboard: Clipboard }

/**
 * The site info panel's contents (the widget puts them in a dialog under the address, over a
 * picture of the page, so nothing is cut out of the website). Connection and certificate status, then what can be
 * done about the site. Clearing signs people out of it, so it asks once, in place (HIG: confirm
 * what can't be undone, without an alert for a small thing).
 */
export function SiteInfoPanel({ host, security, onClearData, permissions, onRevoke, onManageAll }: SiteInfoPanelProps) {
  const copy = SECURITY_COPY[security]
  const [confirming, setConfirming] = useState(false)
  const action =
    "rounded-md px-2 py-1 font-medium outline-none transition-colors duration-(--motion-base) focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
  return (
    <section aria-label={`About ${host}`} className="flex flex-col gap-3 p-3 text-xs">
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
      {/* What this site may use: remembered answers, each revocable (it asks again next time). */}
      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground">Permissions</p>
        {permissions && permissions.permissions.length > 0 ? (
          <ul className="flex flex-col">
            {permissions.permissions.map(([permission, decision]) => {
              const Icon = PERMISSION_ICONS[permission]
              return (
                <li key={permission} className="flex items-center gap-2 py-0.5">
                  <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-foreground">{PERMISSION_NAMES[permission]}</span>
                  <span className="text-muted-foreground">{decision === "allow" ? "Allowed" : "Not allowed"}</span>
                  <button
                    type="button"
                    aria-label={`Forget ${PERMISSION_NAMES[permission]} for ${host}`}
                    title="Forget (it asks again)"
                    onClick={() => onRevoke(permission)}
                    className="flex size-5 items-center justify-center rounded text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground">It hasn't asked for your camera, microphone, location or clipboard.</p>
        )}
        <button type="button" onClick={onManageAll} className="self-start text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:underline">
          All Site Permissions…
        </button>
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

type PermissionCardProps = {
  ask: PermissionAsked
  /** `allow` is remembered for the site; null (Esc) declines this once. */
  onAnswer: (allow: boolean | null) => void
}

/**
 * A site's request for the camera, microphone, location or clipboard: it drops the peek open by
 * itself, right under the domain the peek already shows, so it's clear who asks and the page
 * can't draw over it (HIG privacy.md: ask in context, say who and what, plainly). Don't Allow
 * comes first and neither is the default; the answer is remembered for the site (the site
 * panel can forget it).
 */
export function PermissionCard({ ask, onAnswer }: PermissionCardProps) {
  const Icon = PERMISSION_ICONS[ask.permission]
  const button =
    "rounded-md px-2.5 py-1 font-medium outline-none transition-colors duration-(--motion-base) focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
  return (
    <section
      role="alertdialog"
      aria-label={`${ask.host} wants to ${PERMISSION_ASKS[ask.permission]}`}
      onKeyDown={(event) => event.key === "Escape" && onAnswer(null)}
      className="mx-auto mb-2 flex w-80 max-w-[calc(100%-1rem)] items-center gap-3 rounded-xl bg-muted/60 p-3 text-xs"
    >
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background ring-1 ring-foreground/10">
        <Icon className="size-4 text-foreground" />
      </span>
      <p className="min-w-0 flex-1 text-muted-foreground">
        <span className="font-medium text-foreground">{splitHost(ask.host).domain}</span> wants to {PERMISSION_ASKS[ask.permission]}
      </p>
      <div className="flex shrink-0 gap-1.5">
        <button type="button" onClick={() => onAnswer(false)} className={cn(button, "text-foreground hover:bg-background")}>
          Don't Allow
        </button>
        <button type="button" onClick={() => onAnswer(true)} className={cn(button, "text-foreground ring-1 ring-foreground/15 hover:bg-background")}>
          Allow
        </button>
      </div>
    </section>
  )
}
