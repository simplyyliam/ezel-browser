import { useRef } from "react"
import { splitHost, useContentCutout } from "@/shared"

/** The address split for showing: host prefix, the domain (strong), and the rest of it. */
function parts(text: string) {
  try {
    const url = new URL(text)
    if (url.protocol === "http:" || url.protocol === "https:") {
      const { prefix, domain } = splitHost(url.hostname)
      const port = url.port ? `:${url.port}` : ""
      const rest = `${port}${url.pathname === "/" ? "" : url.pathname}${url.search}${url.hash}`
      return { scheme: url.protocol === "http:" ? "http://" : "", prefix, domain, rest }
    }
  } catch {
    // Not an address (a page's own status text): shown as it is.
  }
  return { scheme: "", prefix: "", domain: "", rest: text }
}

/**
 * Where a hovered link goes, in a small pill at the page's bottom-left (every browser has it;
 * without it people hesitate to click). Only the domain is strong, the same rule as the titlebar
 * peek; plain HTTP shows its scheme. Cut out of the page while it shows; nothing animates.
 */
export function LinkStatus({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  // 1px for the ring, drawn just outside the pill.
  useContentCutout("link-status", () => ref.current, 1)
  const { scheme, prefix, domain, rest } = parts(text)
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute bottom-2 left-2 z-20 max-w-[min(480px,calc(100%-1rem))] truncate rounded-full bg-popover px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-foreground/10"
    >
      {scheme}
      {prefix}
      {domain && <span className="font-medium text-foreground">{domain}</span>}
      {rest}
    </div>
  )
}
