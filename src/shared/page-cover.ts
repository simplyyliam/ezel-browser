import { useSyncExternalStore } from "react"
import { commands } from "./bindings"

// The page's stand-in while something sits over it (the site info panel). The website is a native
// window above the UI: anything drawn over it shows only through a hole cut in it, and a hole's
// edges are whole pixels (jagged) and can't fade. So instead the page is swapped for a picture of
// itself (`capture_page`), drawn by the UI like anything else, and the real page hides until the
// cover is lifted. ContentSlot draws the picture and hides or shows the page.

export type PageCover = {
  /** A JPEG data URL of the page as it was. */
  image: string
  /** False once lifted: the slot shows the page again, then drops the picture (`dropCover`). */
  covered: boolean
}

let cover: PageCover | null = null
const subscribers = new Set<() => void>()

function set(next: PageCover | null) {
  cover = next
  subscribers.forEach((notify) => notify())
}

/**
 * Takes the shown page's picture and puts it in the page's place. Resolves once it's set, true
 * when it is: without a picture the page stays as it is (never hidden behind nothing).
 */
export async function coverPage() {
  const result = await commands.capturePage().catch(() => null)
  if (result?.status !== "ok") return false
  set({ image: `data:image/jpeg;base64,${result.data}`, covered: true })
  return true
}

/** Lifts the cover: the page shows again (the picture stays until it has). */
export function uncoverPage() {
  if (cover?.covered) set({ ...cover, covered: false })
}

/** For ContentSlot, once the page is back on screen. */
export function dropCover() {
  if (cover && !cover.covered) set(null)
}

const subscribe = (notify: () => void) => {
  subscribers.add(notify)
  return () => subscribers.delete(notify)
}

export function usePageCover() {
  return useSyncExternalStore(subscribe, () => cover)
}
