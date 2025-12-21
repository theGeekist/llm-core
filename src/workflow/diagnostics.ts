// References: docs/stage-3.md; docs/runtime.md

export type DiagnosticLevel = "warn" | "error";
export type DiagnosticKind = "pipeline" | "workflow" | "requirement" | "contract";

export type DiagnosticEntry = {
  level: DiagnosticLevel;
  kind: DiagnosticKind;
  message: string;
  data?: unknown;
};

type PipelineDiagnostic = {
  type?: string;
  message?: string;
};

const pipelineLevel = (diagnostic: PipelineDiagnostic): DiagnosticLevel => {
  switch (diagnostic.type) {
    case "missing-dependency":
    case "conflict":
      return "error";
    case "unused-helper":
      return "warn";
    default:
      return "warn";
  }
};

export const createLifecycleDiagnostic = (message: string): DiagnosticEntry => ({
  level: "warn",
  kind: "workflow",
  message,
});

export const createRequirementDiagnostic = (message: string): DiagnosticEntry => ({
  level: "warn",
  kind: "requirement",
  message,
});

export const createContractDiagnostic = (message: string): DiagnosticEntry => ({
  level: "warn",
  kind: "contract",
  message,
});

export const createPipelineDiagnostic = (diagnostic: unknown): DiagnosticEntry => {
  if (typeof diagnostic === "string") {
    return {
      level: "warn",
      kind: "pipeline",
      message: diagnostic,
      data: diagnostic,
    };
  }
  const typed = diagnostic as PipelineDiagnostic;
  return {
    level: pipelineLevel(typed),
    kind: "pipeline",
    message: typed.message ?? "Pipeline diagnostic reported.",
    data: diagnostic,
  };
};

export const normalizeDiagnostics = (
  diagnostics: DiagnosticEntry[],
  pipelineDiagnostics: unknown[],
) => {
  const normalized = [...diagnostics];
  for (const diagnostic of pipelineDiagnostics) {
    normalized.push(createPipelineDiagnostic(diagnostic));
  }
  return normalized;
};

export const hasErrorDiagnostics = (diagnostics: DiagnosticEntry[]) =>
  diagnostics.some((diagnostic) => diagnostic.level === "error");

const shouldPromoteToError = (diagnostic: DiagnosticEntry) =>
  diagnostic.kind === "requirement" || diagnostic.kind === "contract";

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
