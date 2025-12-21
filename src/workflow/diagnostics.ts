// References: docs/implementation-plan.md#L55-L57,L108-L114; docs/workflow-notes.md

export type DiagnosticSeverity = "warn" | "error";

export const severityForMode = (mode: "permissive" | "strict"): DiagnosticSeverity =>
  mode === "strict" ? "error" : "warn";
