import { Profiler, type ReactNode } from "react";
import { onPerfRender, PERF } from "../../perf";

/** Times its children's commits in measurement builds (shared/perf.ts); just the children otherwise. */
export function PerfProfiler({ id, children }: { id: string; children: ReactNode }) {
  return PERF ? (
    <Profiler id={id} onRender={onPerfRender}>
      {children}
    </Profiler>
  ) : (
    children
  );
}
