import { useSyncExternalStore } from "react"
import { getWindowRadius, onWindowRadiusChanged } from "./tauri"
import type { WindowRadius } from "./types"

// One subscription to Rust for the whole app; components read it through useWindowRadius().
let current: WindowRadius = { radius: null, customized: false }
let gotEvent = false
let started = false
const listeners = new Set<() => void>()

function set(next: WindowRadius) {
  current = next
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!started) {
    started = true
    onWindowRadiusChanged((next) => {
      gotEvent = true
      set(next)
    })
    // Don't let a slow initial read overwrite a newer event.
    getWindowRadius().then((next) => {
      if (!gotEvent) set(next)
    })
  }
  return () => listeners.delete(listener)
}

/** The OS window corner radius in logical px (`radius: null` = unknown, keep CSS defaults). */
export const useWindowRadius = () => useSyncExternalStore(subscribe, () => current)
