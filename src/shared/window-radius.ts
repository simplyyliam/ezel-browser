import { useSyncExternalStore } from "react"
import { commands, events } from "./bindings"
import { unwrap } from "./report-error"
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
    events.windowRadiusChanged.listen((event) => {
      gotEvent = true
      set(event.payload)
    })
    // Don't let a slow initial read overwrite a newer event.
    unwrap("get window radius", commands.getWindowRadius()).then((next) => {
      if (next && !gotEvent) set(next)
    })
  }
  return () => listeners.delete(listener)
}

/** The OS window corner radius in logical px (`radius: null` = unknown, keep CSS defaults). */
export const useWindowRadius = () => useSyncExternalStore(subscribe, () => current)
