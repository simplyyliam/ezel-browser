import { useEffect, useState } from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Dialog, DialogPortal } from "@/components/ui/dialog"
import { SpacePicker } from "@/features/zen-import/space-picker"
import { cn } from "@/lib/utils"
import { reportError, setZenImportOpen, showToast, useZenImportOpen, type ImportSummary, type ZenImportPreview } from "@/shared"
import { commands } from "@/shared/bindings"

type Step =
  | { kind: "looking" }
  | { kind: "problem"; title: string; detail: string; retry: boolean }
  | { kind: "choosing"; preview: ZenImportPreview }
  | { kind: "importing" }

const button =
  "rounded-lg px-3 py-1.5 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none"

/**
 * Import from Zen: finds Zen's profile, shows what it holds, and imports the spaces people choose
 * (docs/research/zen-import.md). Read-only for Zen; logins and cookies stay there (it says so).
 * A dialog without a backdrop, cut out of the page like the palette. Mount once (AppLayout).
 */
export function ZenImport() {
  const open = useZenImportOpen()
  return (
    <Dialog open={open} onOpenChange={setZenImportOpen}>
      <DialogPortal>
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className="fixed top-[16%] left-1/2 z-50 flex w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-popover text-popover-foreground ring-1 ring-foreground/10 outline-none transition-opacity duration-[120ms] data-ending-style:opacity-0 data-starting-style:opacity-0"
        >
          {/* Keyed by each open: it looks for Zen afresh every time. */}
          {open && <ImportFlow key={String(open)} />}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}

async function look(): Promise<Step> {
  try {
    const result = await commands.findZenImport()
    if (result.status === "ok") {
      return result.data.spaces.length === 0 && result.data.essentials === 0
        ? { kind: "problem", title: "Nothing to import", detail: "Zen's profile has no spaces or tabs yet.", retry: false }
        : { kind: "choosing", preview: result.data }
    }
    if (result.error.code === "not_found") {
      return { kind: "problem", title: "Zen isn't here", detail: "Ezel couldn't find Zen for this Windows user, or Zen hasn't saved any tabs yet.", retry: false }
    }
    if (result.error.code === "unavailable") {
      return { kind: "problem", title: "Close Zen first", detail: "Zen is using its files. Close Zen completely, then try again.", retry: true }
    }
    reportError("find Zen", result.error)
  } catch (error) {
    reportError("find Zen", error)
  }
  return { kind: "problem", title: "Couldn't read Zen's tabs", detail: "Its session file may be from a version Ezel doesn't know yet.", retry: true }
}

function ImportFlow() {
  const [step, setStep] = useState<Step>({ kind: "looking" })
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [essentials, setEssentials] = useState(true)
  // Looks on open, and again on Try Again (a new attempt).
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let current = true
    look().then((next) => {
      if (!current) return
      setStep(next)
      if (next.kind === "choosing") setChosen(new Set(next.preview.spaces.map((s) => s.id)))
    })
    return () => {
      current = false
    }
  }, [attempt])

  async function runImport() {
    setStep({ kind: "importing" })
    let summary: ImportSummary | null = null
    try {
      const result = await commands.importFromZen([...chosen], essentials)
      if (result.status === "ok") summary = result.data
      else reportError("import from Zen", result.error)
    } catch (error) {
      reportError("import from Zen", error)
    }
    if (!summary) {
      setStep({ kind: "problem", title: "Couldn't import", detail: "Nothing was changed. Try again.", retry: true })
      return
    }
    setZenImportOpen(false)
    const spaces = summary.spaces === 1 ? "1 space" : `${summary.spaces} spaces`
    showToast({ title: "Imported from Zen", detail: `${spaces}, ${summary.tabs} tabs`, tone: "done" })
  }

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <>
      <div className="flex flex-col gap-1 px-4 pt-4 pb-3">
        <DialogPrimitive.Title className="text-sm font-semibold">Import from Zen</DialogPrimitive.Title>
        <DialogPrimitive.Description className="text-xs text-muted-foreground">
          {step.kind === "problem"
            ? step.detail
            : "Each Zen space becomes an Ezel space, with its pinned tabs, folders and open tabs. Zen stays as it is; logins and cookies stay in Zen."}
        </DialogPrimitive.Description>
      </div>
      {step.kind === "problem" && <p className="px-4 pb-2 text-sm font-medium text-foreground">{step.title}</p>}
      {step.kind === "looking" && <p className="px-4 pb-3 text-sm text-muted-foreground">Looking for Zen…</p>}
      {step.kind === "choosing" && (
        <SpacePicker
          preview={step.preview}
          chosen={chosen}
          onToggle={toggle}
          essentials={essentials}
          onToggleEssentials={() => setEssentials((on) => !on)}
        />
      )}
      <div className="flex justify-end gap-2 px-4 pt-3 pb-4">
        <DialogPrimitive.Close className={cn(button, "text-foreground hover:bg-muted")}>
          {step.kind === "problem" && !step.retry ? "Done" : "Cancel"}
        </DialogPrimitive.Close>
        {step.kind === "problem" && step.retry && (
          <button type="button" onClick={() => (setStep({ kind: "looking" }), setAttempt((n) => n + 1))} className={cn(button, "bg-foreground text-background hover:bg-foreground/90")}>
            Try Again
          </button>
        )}
        {(step.kind === "choosing" || step.kind === "importing") && (
          <button
            type="button"
            disabled={step.kind === "importing" || (chosen.size === 0 && !essentials)}
            onClick={runImport}
            className={cn(button, "bg-foreground text-background hover:bg-foreground/90")}
          >
            {step.kind === "importing" ? "Importing…" : "Import"}
          </button>
        )}
      </div>
    </>
  )
}
