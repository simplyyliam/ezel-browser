import type { AppError } from "./bindings"

// One place for failed backend commands. Commands from `shared/bindings` resolve to
// `{ status: "ok", data } | { status: "error", error: AppError }` instead of throwing, so every
// call site checks the result and hands errors here. For now they go to the console; when the UI
// gets in-place feedback (HIG feedback.md: feedback in the interface, not alerts), it hooks in here.

type CommandResult<T> = { status: "ok"; data: T } | { status: "error"; error: AppError }

/** Reports a failure. `action` says what was being done, e.g. "delete space". */
export function reportError(action: string, error: unknown) {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    const { code, message } = error as AppError
    console.error(`[${action}] ${code}: ${message}`)
  } else {
    console.error(`[${action}]`, error)
  }
}

/**
 * Awaits a command and returns its data, or null after reporting the error.
 * `const id = await unwrap("create space", commands.createSpace(name, icon))`
 */
export async function unwrap<T>(action: string, result: Promise<CommandResult<T>>): Promise<T | null> {
  try {
    const outcome = await result
    if (outcome.status === "ok") return outcome.data
    reportError(action, outcome.error)
  } catch (error) {
    // The bindings rethrow JS errors (IPC failures) instead of returning them.
    reportError(action, error)
  }
  return null
}
