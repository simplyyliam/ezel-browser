import { useEffect, useRef, useState } from "react"
import { commands, events, type Download } from "./bindings"
import { unwrap } from "./report-error"
import { showToast } from "./toast"

/**
 * This session's downloads, newest first (Rust: `browser/downloads.rs`): `get_downloads` on
 * mount, then every `downloads-changed`. A started and a finished download each get a quiet toast.
 */
export function useDownloads() {
  const [downloads, setDownloads] = useState<Download[]>([])
  const known = useRef(new Map<number, Download["state"]>())

  useEffect(() => {
    let gotEvent = false
    const apply = (list: Download[], announce: boolean) => {
      if (announce) {
        for (const download of list) {
          const before = known.current.get(download.id)
          if (before === undefined && download.state === "inProgress") {
            showToast({ title: "Downloading", detail: download.fileName, tone: "info" })
          } else if (before === "inProgress" && download.state === "completed") {
            showToast({ title: "Downloaded", detail: download.fileName, tone: "done" })
          } else if (before === "inProgress" && download.state === "failed") {
            showToast({ title: "Download failed", detail: download.fileName, tone: "info" })
          }
        }
      }
      known.current = new Map(list.map((download) => [download.id, download.state]))
      setDownloads(list)
    }
    const unlisten = events.downloadsChanged.listen((event) => {
      gotEvent = true
      apply(event.payload.downloads, true)
    })
    unwrap("get downloads", commands.getDownloads()).then((state) => {
      if (state && !gotEvent) apply(state.downloads, false)
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  return downloads
}

export const openDownload = (id: number) => unwrap("open download", commands.openDownload(id))
export const showDownloadInFolder = (id: number) => unwrap("show download", commands.showDownloadInFolder(id))
export const cancelDownload = (id: number) => unwrap("cancel download", commands.cancelDownload(id))
export const clearDownloads = () => unwrap("clear downloads", commands.clearDownloads())

/** "3.2 MB", "840 KB". */
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
