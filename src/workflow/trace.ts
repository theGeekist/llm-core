// References: docs/implementation-plan.md#L62-L64; docs/workflow-notes.md

export type TraceEvent = {
  kind: string;
  at: string;
  data?: unknown;
};

export const createTrace = (): TraceEvent[] => [];
