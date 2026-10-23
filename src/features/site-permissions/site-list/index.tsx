import { X } from "lucide-react"
import { splitHost, PERMISSION_NAMES, type SitePermission, type SitePermissions } from "@/shared"
import { ScrollArea } from "@/shared/components"

type SiteListProps = {
  sites: SitePermissions[]
  onRevoke: (origin: string, permission: SitePermission) => void
}

/**
 * Every site with a remembered answer, and what it may or may not use. Forgetting one means the
 * site asks again next time (nothing is turned off behind people's back).
 */
export function SiteList({ sites, onRevoke }: SiteListProps) {
  if (sites.length === 0) {
    return (
      <p className="px-4 pb-5 text-sm text-muted-foreground">
        No site has asked yet. When one asks for your camera, microphone, location or clipboard, your answer shows up here.
      </p>
    )
  }
  return (
    <ScrollArea className="max-h-[min(420px,60vh)]">
      <ul className="flex flex-col gap-1 px-2 pb-3">
        {sites.map((site) => {
          const { prefix, domain } = splitHost(site.host)
          return (
            <li key={site.origin} className="rounded-xl px-2 py-1.5">
              <p className="truncate text-sm">
                <span className="text-muted-foreground">{prefix}</span>
                <span className="font-medium text-foreground">{domain}</span>
              </p>
              <ul className="mt-0.5 flex flex-col">
                {site.permissions.map(([permission, decision]) => (
                  <li key={permission} className="flex items-center gap-2 py-0.5 text-xs">
                    <span className="flex-1 text-foreground">{PERMISSION_NAMES[permission]}</span>
                    <span className="text-muted-foreground">{decision === "allow" ? "Allowed" : "Not allowed"}</span>
                    <button
                      type="button"
                      aria-label={`Forget ${PERMISSION_NAMES[permission]} for ${site.host}`}
                      title="Forget (it asks again)"
                      onClick={() => onRevoke(site.origin, permission)}
                      className="flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X aria-hidden className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </ScrollArea>
  )
}
