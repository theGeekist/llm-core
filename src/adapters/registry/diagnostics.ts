import type { PipelineDiagnostic, PipelineReporter } from "@wpkernel/pipeline/core";
import type { AdapterDiagnostic } from "../types";

export const createDefaultReporter = (): PipelineReporter => ({
  warn: (message, context) => console.warn(message, context),
});

export const warn = (message: string, data?: unknown): AdapterDiagnostic => ({
  level: "warn",
  message,
  data,
});

export const registryDiagnostic = (
  level: "warn" | "error",
  code: string,
  data?: Record<string, unknown>,
): AdapterDiagnostic => ({
  level,
  message: code,
  data,
});

export const pipelineDiagnostic = (diagnostic: PipelineDiagnostic): AdapterDiagnostic =>
  warn("registry_pipeline_diagnostic", diagnostic);
