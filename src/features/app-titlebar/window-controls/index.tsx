import { Minus, Square, X } from "lucide-react"
import { closeWindow, minimizeWindow, toggleMaximizeWindow } from "@/shared"

const btn =
  "flex cursor-pointer items-center justify-center px-4 py-2 transition-colors ease-linear hover:bg-neutral-300"

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
