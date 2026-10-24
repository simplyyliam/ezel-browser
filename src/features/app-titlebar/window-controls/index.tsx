import { Minus, Square, X } from "lucide-react"
import { closeWindow, minimizeWindow, toggleMaximizeWindow } from "@/shared"

// The ring sits inside the button: the titlebar clips anything drawn past its edge.
const btn =
  "flex cursor-pointer items-center justify-center px-4 py-2 outline-none transition-colors ease-linear hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"

export function WindowControls() {
  return (
    <div className="flex items-center">
      <button type="button" aria-label="Minimize" onClick={minimizeWindow} className={btn}>
        <Minus size={16} />
      </button>
      <button type="button" aria-label="Maximize" onClick={toggleMaximizeWindow} className={btn}>
        <Square size={16} />
      </button>
      <button type="button" aria-label="Close" onClick={closeWindow} className={btn}>
        <X size={16} />
      </button>
    </div>
  )
}
