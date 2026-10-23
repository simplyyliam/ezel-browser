import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { commands, events, type PermissionAsked, type SitePermission, type SitePermissions } from "./bindings"
import { unwrap } from "./report-error"

// Site permissions (Rust: `browser/permissions.rs`): Ezel's own prompt in the titlebar peek,
// answers remembered per site, and a list to review and revoke them.

/** What a site asks to do, finishing "maps.example.com wants to …" (HIG privacy.md: plain and specific). */
export const PERMISSION_ASKS: Record<SitePermission, string> = {
  camera: "use your camera",
  microphone: "use your microphone",
  location: "know your location",
  clipboard: "see what you've copied",
}

/** The permission's name in lists. */
export const PERMISSION_NAMES: Record<SitePermission, string> = {
  camera: "Camera",
  microphone: "Microphone",
  location: "Location",
  clipboard: "Clipboard",
}

/**
 * The shown tab's prompts waiting for an answer, oldest first (the peek shows the first). Showing
 * another tab drops the rest: Rust declines them this once.
 */
export function usePermissionAsks(activeTabId: number | null) {
  const [asks, setAsks] = useState<PermissionAsked[]>([])
  // Adjusted while rendering (React's pattern for state that follows a prop).
  if (asks.some((ask) => ask.tabId !== activeTabId)) setAsks(asks.filter((ask) => ask.tabId === activeTabId))
  useEffect(() => {
    const unlisten = events.permissionAsked.listen((event) => setAsks((current) => [...current, event.payload]))
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])
  /** `allow` is remembered for the site; null declines this once (dismissed). */
  const answer = useCallback((id: number, allow: boolean | null) => {
    setAsks((current) => current.filter((ask) => ask.id !== id))
    unwrap("answer permission", commands.answerPermission(id, allow)).then(() => notifyChanged())
  }, [])
  return { asks, answer }
}

// Lists reload when an answer is given or one is revoked, wherever that happened.
let version = 0
const listeners = new Set<() => void>()
function notifyChanged() {
  version++
  listeners.forEach((notify) => notify())
}
const subscribe = (notify: () => void) => {
  listeners.add(notify)
  return () => listeners.delete(notify)
}

/** Every site's remembered answers, read while `active` (a panel or list is open). */
export function useSitePermissions(active: boolean) {
  const changed = useSyncExternalStore(subscribe, () => version)
  const [sites, setSites] = useState<SitePermissions[]>([])
  useEffect(() => {
    if (!active) return
    let current = true
    unwrap("get site permissions", commands.getSitePermissions()).then((list) => {
      if (current && list) setSites(list)
    })
    return () => {
      current = false
    }
  }, [active, changed])
  return sites
}

/** Forgets one answer: the site asks again next time. */
export async function revokeSitePermission(origin: string, permission: SitePermission) {
  await unwrap("revoke permission", commands.revokeSitePermission(origin, permission))
  notifyChanged()
}

/** A page address's origin, as Rust keys permissions (`https://host[:port]`), or null. */
export function originOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : null
  } catch {
    return null
  }
}

// Who has the permissions list open (the palette and the site panel open it).
let listOpen = false
const listListeners = new Set<() => void>()
export function setSitePermissionsOpen(open: boolean) {
  listOpen = open
  listListeners.forEach((notify) => notify())
}
export const openSitePermissions = () => setSitePermissionsOpen(true)
export const useSitePermissionsOpen = () =>
  useSyncExternalStore(
    (notify) => {
      listListeners.add(notify)
      return () => listListeners.delete(notify)
    },
    () => listOpen,
  )
