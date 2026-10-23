import { useSyncExternalStore } from "react"

// Who has "Import from Zen" open (the palette's action); only `widgets/zen-import` draws it.
let open = false
const listeners = new Set<() => void>()

export function setZenImportOpen(next: boolean) {
  open = next
  listeners.forEach((notify) => notify())
}

export const openZenImport = () => setZenImportOpen(true)

export const useZenImportOpen = () =>
  useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => open,
  )
