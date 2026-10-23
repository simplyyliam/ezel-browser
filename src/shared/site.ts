import type { PageSecurity } from "./bindings"

// How a page's address is shown where the site matters (the titlebar's domain): only the domain
// people recognise is emphasised, so "accounts.google.com.evil.test" reads as evil.test.

/**
 * Second-level labels that are public suffixes in common country domains (co.uk, com.au…). Not
 * the full Public Suffix List: an unknown pair just shows one label more in the strong part.
 */
const SECOND_LEVEL = new Set(["co", "com", "net", "org", "gov", "edu", "ac", "or", "ne", "go", "gob", "nic", "ltd", "plc"])

/** A web page's host, or null (about:blank, nothing shown, not a web address). */
export function siteHost(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.hostname.toLowerCase() || null : null
  } catch {
    return null
  }
}

/**
 * The host split into what comes before the registrable domain and the domain itself:
 * "www.figma.com" → { prefix: "www.", domain: "figma.com" }; "bbc.co.uk" → { "", "bbc.co.uk" }.
 * IP addresses and single-label hosts (localhost) are all domain.
 */
export function splitHost(host: string): { prefix: string; domain: string } {
  const labels = host.split(".")
  const isIp = /^[\d.]+$/.test(host) || host.includes(":")
  if (isIp || labels.length <= 2) return { prefix: "", domain: host }
  const sld = labels[labels.length - 2]
  const keep = SECOND_LEVEL.has(sld) && labels[labels.length - 1].length === 2 ? 3 : 2
  if (labels.length <= keep) return { prefix: "", domain: host }
  return { prefix: `${labels.slice(0, -keep).join(".")}.`, domain: labels.slice(-keep).join(".") }
}

/** What the site info panel says about the connection. */
export const SECURITY_COPY: Record<PageSecurity, { title: string; detail: string } | null> = {
  none: null,
  secure: { title: "Connection is secure", detail: "What you send and see here is encrypted, and the site's certificate is valid." },
  notSecure: {
    title: "Connection isn't secure",
    detail: "This site doesn't use HTTPS, so others on the network could see or change it. Don't enter passwords or card details.",
  },
  certificateError: {
    title: "Certificate problem",
    detail: "Ezel couldn't confirm this site is who it says it is. Someone may be pretending to be it.",
  },
}
