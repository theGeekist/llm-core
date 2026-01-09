import type { DiagnosticEntry, DiagnosticLevel } from "./reporting";
import { applyDiagnosticsMode } from "./reporting";

export type { DiagnosticEntry, DiagnosticLevel, DiagnosticKind } from "./reporting";
export { applyDiagnosticsMode };

type AdapterDiagnosticShape = {
  level: DiagnosticLevel;
  message: string;
  data?: unknown;
};

export const createLifecycleDiagnostic = (message: string, data?: unknown): DiagnosticEntry => ({
  level: "warn",
  kind: "pipeline",
  message,
  data,
});

export const createResumeDiagnostic = (message: string, data?: unknown): DiagnosticEntry => ({
  level: "warn",
  kind: "resume",
  message,
  data,
});

export const createRequirementDiagnostic = (message: string, data?: unknown): DiagnosticEntry => ({
  level: "warn",
  kind: "requirement",
  message,
  data,
});

export const createContractDiagnostic = (message: string, data?: unknown): DiagnosticEntry => ({
  level: "warn",
  kind: "contract",
  message,
  data,
});

export const createPipelineDiagnostic = (data: unknown): DiagnosticEntry => {
  let level: DiagnosticLevel = "warn";
  let message = "Pipeline diagnostic reported.";

  if (typeof data === "string") {
    message = data;
  } else if (data && typeof data === "object") {
    const typed = data as { type?: string; message?: string };
    if (typed.message) {
      message = typed.message;
    }
    if (typed.type === "missing-dependency" || typed.type === "conflict") {
      level = "error";
    }
  }

  return {
    level,
    kind: "pipeline",
    message,
    data,
  };
};

export const createRecipeDiagnostic = (message: string, data?: unknown): DiagnosticEntry => ({
  level: "warn",
  kind: "recipe",
  message,
  data,
});

export const createAdapterDiagnostic = (
  diagnostic: AdapterDiagnosticShape,
  source?: string,
): DiagnosticEntry => {
  let finalData: unknown = diagnostic.data;

  if (source) {
    if (diagnostic.data && typeof diagnostic.data === "object") {
      finalData = { ...(diagnostic.data as object), source };
    } else if (diagnostic.data !== undefined && diagnostic.data !== null) {
      finalData = { data: diagnostic.data, source };
    } else {
      finalData = { source };
    }
  }

  return {
    level: diagnostic.level,
    kind:
      diagnostic.data &&
      typeof diagnostic.data === "object" &&
      ((diagnostic.data as { code?: string }).code === "construct_dependency_missing" ||
        (diagnostic.data as { code?: string }).code === "capability_dependency_missing")
        ? "requirement"
        : "adapter",
    message: diagnostic.message,
    data: finalData,
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
