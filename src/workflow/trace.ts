// References: docs/implementation-plan.md#L62-L64; docs/workflow-notes.md

export type TraceEvent = {
  kind: string;
  at: string;
  data?: unknown;
};

export const createTrace = (): TraceEvent[] => [];

export const addTraceEvent = (trace: TraceEvent[], kind: string, data?: unknown) => {
  trace.push({ kind, at: new Date().toISOString(), data });
};
