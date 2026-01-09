import type { PipelineReporter } from "@wpkernel/pipeline/core";
import type { AdapterBundle, PauseKind } from "../adapters/types";
export type { DiagnosticEntry, TraceDiagnostics, TraceEvent } from "./reporting";

// TraceDiagnostics exported from reporting

export type ExecutionContextBase = {
  reporter: PipelineReporter;
  adapters?: AdapterBundle;
};

export type PauseRequest = {
  token?: unknown;
  pauseKind?: PauseKind;
  payload?: unknown;
};

export type RunOptionsBase = {
  input: unknown;
  adapters?: AdapterBundle;
  reporter?: PipelineReporter;
};

export type StepSpecBase = {
  name: string;
  dependsOn?: readonly string[];
  priority?: number;
  origin?: string;
};

export type StepPackBase = {
  name: string;
  steps: StepSpecBase[];
};

export type PlanStepBase = {
  id: string;
  dependsOn: string[];
  priority?: number;
};

export type PlanBase = {
  name: string;
  steps: PlanStepBase[];
};
