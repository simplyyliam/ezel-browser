import type { ProfilerOnRenderCallback } from "react"
import { commands, events } from "./bindings"

/**
 * Measurement builds only: `VITE_EZEL_PERF=1` with the `perf` cargo feature (docs/perf/many-tabs.md,
 * `scripts/measure-many-tabs.mjs`). A constant, so normal builds drop everything below.
 */
export const PERF = import.meta.env.VITE_EZEL_PERF === "1"

type PerfData = {
  /** Render counts by name (`row`: every TabRow render). */
  counts: Record<string, number>
  /** React commits of `PerfProfiler` trees: which, how long (ms), when (performance.now()). */
  commits: { id: string; phase: string; duration: number; at: number }[]
  /** Long main-thread tasks: start and duration (ms). */
  longTasks: { at: number; duration: number }[]
  /** First times (performance.now()). */
  marks: Record<string, number>
  /** For the measuring script, which drives the app through the same calls the UI makes. */
  commands: typeof commands
  events: typeof events
}

const data: PerfData | null = PERF
  ? ((window as unknown as { __ezelPerf: PerfData }).__ezelPerf = { counts: {}, commits: [], longTasks: [], marks: {}, commands, events })
  : null

if (data) {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) data.longTasks.push({ at: entry.startTime, duration: entry.duration })
  }).observe({ type: "longtask", buffered: true })
}

/** Counts one render of `name`. */
export function perfCount(name: string) {
  if (data) data.counts[name] = (data.counts[name] ?? 0) + 1
}

/** Notes the first time `name` happens. */
export function perfMark(name: string) {
  if (data && !(name in data.marks)) data.marks[name] = performance.now()
}

/** `<Profiler onRender>` for measurement builds (`PerfProfiler`): every commit, timed. */
export const onPerfRender: ProfilerOnRenderCallback = (id, phase, duration, _base, _start, commitTime) => {
  data?.commits.push({ id, phase, duration, at: commitTime })
}
