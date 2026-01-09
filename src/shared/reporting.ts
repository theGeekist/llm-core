export type TraceEvent = {
  kind: string;
  at: string;
  data?: unknown;
};

export type DiagnosticLevel = "warn" | "error";

export type DiagnosticKind =
  | "pipeline"
  | "workflow"
  | "requirement"
  | "contract"
  | "resume"
  | "adapter"
  | "recipe";

export type DiagnosticEntry = {
  level: DiagnosticLevel;
  kind: DiagnosticKind;
  message: string;
  data?: unknown;
};

export type TraceDiagnostics = {
  trace: TraceEvent[];
  diagnostics: DiagnosticEntry[];
};

export const createTraceDiagnostics = (): TraceDiagnostics => ({
  trace: [],
  diagnostics: [],
});

export const addTrace = (target: { trace: TraceEvent[] }, kind: string, data?: unknown) => {
  target.trace.push({
    kind,
    at: new Date().toISOString(),
    data,
  });
};

export const addDiagnostic = (
  target: { diagnostics: DiagnosticEntry[] },
  entry: DiagnosticEntry,
) => {
  target.diagnostics.push(entry);
};

const shouldPromoteToError = (diagnostic: DiagnosticEntry) =>
  diagnostic.kind === "requirement" ||
  diagnostic.kind === "contract" ||
  diagnostic.kind === "recipe";

export const applyDiagnosticsMode = (
  diagnostics: DiagnosticEntry[],
  mode: "default" | "strict",
): DiagnosticEntry[] => {
  if (mode !== "strict") {
    return diagnostics;
  }
  return diagnostics.map((diagnostic) =>
    shouldPromoteToError(diagnostic)
      ? { ...diagnostic, level: "error" as DiagnosticLevel }
      : diagnostic,
  );
};

export const applyDiagnosticsModeToTraceDiagnostics = (
  td: TraceDiagnostics,
  mode: "default" | "strict",
): TraceDiagnostics => ({
  ...td,
  diagnostics: applyDiagnosticsMode(td.diagnostics, mode),
});
