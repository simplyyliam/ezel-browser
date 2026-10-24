import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react"
import { Command as CommandPrimitive } from "cmdk"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { DURATION, EASE_OUT, ENTER, INSTANT } from "@/shared"

type SearchFieldProps = {
  value: string
  onValueChange: (value: string) => void
  /** Autofill: the rest of a site's address, drawn faintly after the caret. Tab or → accepts it. */
  completion: string | null
  onAcceptCompletion: () => void
  /** Backspace/Delete over a completion removes it, like in every browser's address bar. */
  onDismissCompletion: () => void
  /** What the leading icon shows; a new key crossfades to the new icon. */
  icon: { key: string; node: ReactNode }
  placeholder: string
  inputRef: RefObject<HTMLInputElement | null>
}

const ICON_IN = { opacity: 1, scale: 1, filter: "blur(0px)" }
const ICON_OUT = { opacity: 0, scale: 0.6, filter: "blur(2px)" }

/**
 * The palette's input. Its leading icon follows what Enter will do: a magnifier for a search, the
 * site's own favicon as soon as the text reads as an address.
 */
export function SearchField({
  value,
  onValueChange,
  completion,
  onAcceptCompletion,
  onDismissCompletion,
  icon,
  placeholder,
  inputRef,
}: SearchFieldProps) {
  const reduceMotion = useReducedMotion()
  // The ghost text lines up with the typed text only while the caret is at the end and nothing scrolled.
  const [ghostFits, setGhostFits] = useState(true)
  const measureRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const input = inputRef.current
    const measure = measureRef.current
    if (!input || !measure) return
    setGhostFits(measure.offsetWidth < input.clientWidth - 8)
  }, [value, completion, inputRef])

  const showGhost = completion !== null && ghostFits

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showGhost) return
    const input = event.currentTarget
    const atEnd = input.selectionStart === value.length && input.selectionEnd === value.length
    if ((event.key === "Tab" && !event.shiftKey) || (event.key === "ArrowRight" && atEnd) || (event.key === "End" && atEnd)) {
      event.preventDefault()
      onAcceptCompletion()
    } else if (event.key === "Backspace" || event.key === "Delete") {
      // The first press takes the suggestion away; the next ones edit the text.
      event.preventDefault()
      onDismissCompletion()
    }
  }

  return (
    <div className="flex h-12 items-center gap-3 px-4">
      <span className="relative grid size-5 shrink-0 place-items-center text-muted-foreground">
        <AnimatePresence initial={false}>
          <motion.span
            key={icon.key}
            initial={ICON_OUT}
            animate={ICON_IN}
            exit={ICON_OUT}
            transition={reduceMotion ? INSTANT : { duration: DURATION.base, ease: EASE_OUT }}
            className="absolute inset-0 grid place-items-center"
          >
            {icon.node}
          </motion.span>
        </AnimatePresence>
      </span>

      {/* The input and its ghost share one grid cell, so the completion starts exactly where the text ends. */}
      <div className="relative grid min-w-0 flex-1 text-[15px]">
        <CommandPrimitive.Input
          ref={inputRef}
          value={value}
          onValueChange={onValueChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="col-start-1 row-start-1 h-8 w-full min-w-0 bg-transparent font-normal text-foreground caret-primary outline-none placeholder:text-muted-foreground/70"
        />
        <div
          aria-hidden
          className="pointer-events-none col-start-1 row-start-1 flex h-8 items-center overflow-hidden whitespace-pre"
        >
          <span ref={measureRef} className="invisible">
            {value}
          </span>
          {showGhost && (
            <motion.span
              key={value + completion}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={ENTER}
              // A selection-like tint, so it reads as "this will be filled in".
              className="rounded-[3px] bg-primary/15 text-foreground/45"
            >
              {completion}
            </motion.span>
          )}
        </div>
      </div>

      {showGhost && (
        <kbd className="hidden shrink-0 items-center rounded-md bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground sm:flex">
          Tab
        </kbd>
      )}
    </div>
  )
}
