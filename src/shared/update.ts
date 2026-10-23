import { useEffect, useState } from "react"
import { commands, events } from "./bindings"
import { unwrap } from "./report-error"

/**
 * The version of Ezel downloaded and waiting for a restart, or null (Rust's updater: checked at
 * launch and once a day, release builds only). `get_update_status` on mount, then every
 * `update-status`.
 */
export function useReadyUpdate() {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    // Subscribe first; an event that arrives before the snapshot is newer, so it wins.
    let gotEvent = false
    const unlisten = events.updateStatus.listen((event) => {
      gotEvent = true
      setVersion(event.payload.readyVersion)
    })
    unwrap("get update status", commands.getUpdateStatus()).then((status) => {
      if (status && !gotEvent) setVersion(status.readyVersion)
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  return version
}

/** Installs the waiting update; Ezel closes and the installer opens it again. */
export const installUpdate = () => unwrap("install update", commands.installUpdate())
