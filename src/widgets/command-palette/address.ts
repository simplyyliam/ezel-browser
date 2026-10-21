import type { Tab } from "@/shared"

// What the palette's input means, mirroring Rust's `resolve_input` (src-tauri/src/browser/commands.rs)
// so the first row says what Enter will do. Rust still decides; this only labels.

/** Web addresses, the only ones a tab loads (Rust's `url_policy`). */
const SCHEMES = ["http://", "https://"]
/** Refused by Rust when typed (a local file or code): the palette offers only a search for them. */
const BLOCKED = /^\s*(file|javascript|data|vbscript|blob):/i

export type Resolved = { kind: "url"; url: string; host: string } | { kind: "search"; query: string }

/** A URL is loaded as-is (`https://` added if missing); anything else is a Google search. */
export function resolveInput(raw: string): Resolved {
  const input = raw.trim()
  const lower = input.toLowerCase()
  if (BLOCKED.test(input) || (lower.startsWith("about:") && lower !== "about:blank")) {
    return { kind: "search", query: input }
  }
  if (lower === "about:blank" || SCHEMES.some((scheme) => lower.startsWith(scheme))) {
    return { kind: "url", url: input, host: hostOf(input) }
  }
  const host = input.split(/[/?#]/)[0]
  const looksLikeHost = !/\s/.test(input) && (host.includes(".") || host === "localhost" || host.startsWith("localhost:"))
  // "e.g." or "1.5" aren't sites: a host needs a label after its last dot.
  if (looksLikeHost && /\.[a-z]{2,}(:\d+)?$|^localhost/i.test(host)) {
    return { kind: "url", url: `https://${input}`, host: host.toLowerCase() }
  }
  return { kind: "search", query: input }
}

/** `https://www.github.com/x` → `github.com`; "" when it isn't a URL. */
export function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/** A URL without its scheme, `www.` and trailing slash, as people type it. */
export const displayUrl = (url: string) => url.replace(/^[a-z]+:\/\/(www\.)?/i, "").replace(/\/$/, "")

/**
 * The site's icon for a URL nobody has opened yet (an open tab has its own `favicon`).
 * Search goes to Google already, so asking it for the icon tells it nothing new.
 */
export const siteIcon = (host: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`

export const tokensOf = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean)

/**
 * How well a tab matches: every token must be in its title or address. Higher is better; null is
 * no match. Address starts beat title starts beat word starts beat anywhere.
 */
export function scoreTab(tab: Tab, tokens: string[]): number | null {
  if (tokens.length === 0) return 0
  const title = (tab.title ?? "").toLowerCase()
  const address = displayUrl(tab.url).toLowerCase()
  let score = 0
  for (const token of tokens) {
    if (address.startsWith(token)) score += 100
    else if (title.startsWith(token)) score += 60
    else if (new RegExp(`\\b${escapeRegExp(token)}`).test(`${title} ${address}`)) score += 30
    else if (title.includes(token) || address.includes(token)) score += 10
    else return null
  }
  return score
}

/**
 * Firefox/Zen-style autofill: the rest of an open tab's host when the input is the start of it
 * ("git" → "hub.com"). Hosts come in best-match order; the first that fits wins.
 */
export function completionFor(input: string, hosts: string[]): string | null {
  const typed = input.toLowerCase()
  if (!typed || /[\s/?#]/.test(typed)) return null
  const host = hosts.find((h) => h.startsWith(typed) && h !== typed)
  return host ? host.slice(typed.length) : null
}

export const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
