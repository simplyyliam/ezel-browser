import { ArrowLeft, ArrowRight, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { unwrap } from "@/shared"
import { commands } from "@/shared/bindings"

const goBack = () => unwrap("go back", commands.goBack())
const goForward = () => unwrap("go forward", commands.goForward())
const reload = () => unwrap("reload", commands.reload())

type NavigationProps = {
  canGoBack: boolean
  canGoForward: boolean
}

export function Navigation({ canGoBack, canGoForward }: NavigationProps) {
  return (
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="icon-sm" aria-label="Back" disabled={!canGoBack} onClick={goBack}>
        <ArrowLeft />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Forward" disabled={!canGoForward} onClick={goForward}>
        <ArrowRight />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Reload" onClick={reload}>
        <RotateCw />
      </Button>
    </div>
  )
}
