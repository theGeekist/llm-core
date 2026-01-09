import type { TraceEvent } from "./reporting";

export type { TraceEvent };

/**
 * @deprecated Use createTraceDiagnostics in ./reporting
 */
export const createTrace = (): TraceEvent[] => [];

/**
 * @deprecated Use addTrace in ./reporting
 */
export const addTraceEvent = (trace: TraceEvent[], kind: string, data?: unknown) => {
  // Adapt old signature (push to array) to new logic if possible,
  // but addTrace takes TraceDiagnostics (in my mental model, better check reporting.ts again).
  // Checking reporting.ts content I wrote:
  // export const addTrace = (target: { trace: TraceEvent[] }, kind: string, data?: unknown)
  // So it is compatible with { trace: TraceEvent[] } but here we have just TraceEvent[].
  // I will just keep the implementation simple here to avoid breaking callers yet.
  trace.push({ kind, at: new Date().toISOString(), data });
};
