// References: docs/implementation-plan.md#L34-L37,L108-L114; docs/workflow-notes.md

import type { Outcome } from "./outcome";

export type WorkflowRuntime = {
  run: (input: unknown, runtime?: unknown) => Outcome;
  resume?: (token: unknown, humanInput?: unknown, runtime?: unknown) => Outcome;
  capabilities: () => Record<string, unknown>;
  explain: () => { plugins: string[]; overrides: string[]; unused: string[] };
  contract?: () => unknown;
};

export const createRuntime = (): WorkflowRuntime => ({
  run: () => ({
    status: "error",
    error: new Error("not implemented"),
    trace: [],
    diagnostics: [],
  }),
  capabilities: () => ({}),
  explain: () => ({ plugins: [], overrides: [], unused: [] }),
});
