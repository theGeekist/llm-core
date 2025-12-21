// References: docs/implementation-plan.md#L59-L60,L108-L114; docs/workflow-notes.md

export type Outcome =
  | { status: "ok"; artefact: unknown; trace: unknown[]; diagnostics: unknown[] }
  | { status: "needsHuman"; token: unknown; artefact: unknown; trace: unknown[]; diagnostics: unknown[] }
  | { status: "error"; error: unknown; trace: unknown[]; diagnostics: unknown[] };

export const isOk = (outcome: Outcome): outcome is Extract<Outcome, { status: "ok" }> =>
  outcome.status === "ok";
