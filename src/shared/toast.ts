import { useSyncExternalStore } from "react"

// One small passive confirmation at a time (HIG feedback.md: status near where it happened, no
// interruption). Anything may call `showToast`; only `Toaster` (shared/components, mounted in
// AppLayout) draws it.

export type ToastMessage = {
  /** What happened, past tense: "Link copied". */
  title: string
  /** Quiet context after the title, e.g. the host. */
  detail?: string
  /** "done" draws a check; "info" none (a command that couldn't run). */
  tone?: "done" | "info"
}

/** Long enough to read two words, short enough to be gone before the next action. */
const DURATION_MS = 1800

type ToastState = { toast: (ToastMessage & { key: number }) | null }

let state: ToastState = { toast: null }
let timer = 0
const subscribers = new Set<() => void>()

function set(next: ToastState) {
  state = next
  subscribers.forEach((notify) => notify())
}

/** Shows `message`, replacing any toast on screen (a new key, so it pops in again). */
export function showToast(message: ToastMessage) {
  window.clearTimeout(timer)
  set({ toast: { tone: "done", ...message, key: Date.now() } })
  timer = window.setTimeout(() => set({ toast: null }), DURATION_MS)
}

const subscribe = (notify: () => void) => {
  subscribers.add(notify)
  return () => subscribers.delete(notify)
}

export const useToast = () => useSyncExternalStore(subscribe, () => state.toast)
