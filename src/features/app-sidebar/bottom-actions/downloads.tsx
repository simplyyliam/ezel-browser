import { File, FolderOpen, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatBytes, type Download } from "@/shared"
import { ScrollArea } from "@/shared/components"

/** What the list can do with a download; the widget holds the commands. */
export type DownloadActions = {
  open: (id: number) => void
  showInFolder: (id: number) => void
  cancel: (id: number) => void
  clear: () => void
}

const icon =
  "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [&_svg]:size-3.5"

function status(download: Download) {
  const { state, receivedBytes, totalBytes } = download
  if (state === "completed") return totalBytes !== null ? formatBytes(totalBytes) : "Done"
  if (state === "cancelled") return "Cancelled"
  if (state === "failed") return "Failed"
  return totalBytes ? `${formatBytes(receivedBytes)} of ${formatBytes(totalBytes)}` : formatBytes(receivedBytes)
}

/**
 * The downloads list behind the footer's button (catalog area "download"): newest first, a bar
 * while one runs, then Open (the name) and Show in Folder, or Cancel while it runs. Ezel's own,
 * in place of WebView2's flyout.
 */
export function DownloadsList({ downloads, actions }: { downloads: Download[]; actions: DownloadActions }) {
  const finished = downloads.some((d) => d.state !== "inProgress")
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-medium text-foreground">Downloads</p>
        {finished && (
          <button type="button" onClick={actions.clear} className="rounded-md px-1.5 py-0.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring">
            Clear
          </button>
        )}
      </div>
      {downloads.length === 0 ? (
        <p className="px-1 py-3 text-xs text-muted-foreground">Files you download show up here.</p>
      ) : (
        <ScrollArea className="max-h-72">
          <ul className="flex flex-col gap-0.5">
            {downloads.map((download) => (
              <DownloadRow key={download.id} download={download} actions={actions} />
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  )
}

function DownloadRow({ download, actions }: { download: Download; actions: DownloadActions }) {
  const running = download.state === "inProgress"
  const done = download.state === "completed"
  const progress = download.totalBytes ? Math.min(download.receivedBytes / download.totalBytes, 1) : null
  return (
    <li className="group/download flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-accent/60">
      <File aria-hidden className={cn("size-4 shrink-0", done ? "text-foreground" : "text-muted-foreground")} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {done ? (
          <button
            type="button"
            title={`Open ${download.fileName}`}
            onClick={() => actions.open(download.id)}
            className="min-w-0 cursor-pointer truncate text-left text-xs font-medium text-foreground outline-none hover:underline focus-visible:underline"
          >
            {download.fileName}
          </button>
        ) : (
          <span className={cn("min-w-0 truncate text-xs", running ? "text-foreground" : "text-muted-foreground line-through decoration-muted-foreground/40")}>
            {download.fileName}
          </span>
        )}
        {running && (
          // Indeterminate while the size is unknown: a short bar, no motion (calm, and nothing loops).
          <span aria-hidden className="h-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-foreground/60" style={{ width: `${Math.round((progress ?? 0.15) * 100)}%` }} />
          </span>
        )}
        <span className={cn("text-[11px] tabular-nums text-muted-foreground", download.state === "failed" && "text-destructive")}>{status(download)}</span>
      </div>
      {running ? (
        <button type="button" aria-label={`Cancel ${download.fileName}`} title="Cancel" onClick={() => actions.cancel(download.id)} className={icon}>
          <X aria-hidden />
        </button>
      ) : done ? (
        <button
          type="button"
          aria-label={`Show ${download.fileName} in folder`}
          title="Show in Folder"
          onClick={() => actions.showInFolder(download.id)}
          className={icon}
        >
          <FolderOpen aria-hidden />
        </button>
      ) : null}
    </li>
  )
}
