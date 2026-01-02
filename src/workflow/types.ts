// References: docs/implementation-plan.md#L25-L42; docs/workflow-notes.md

import type {
  MaybePromise,
  PipelineExtensionHook,
  PipelineExtensionRegisterOutput,
  PipelineReporter,
  PipelinePauseSnapshot,
} from "@wpkernel/pipeline/core";
import type { AdapterBundle, AdapterResume, RetryConfig } from "../adapters/types";
import type {
  AgentInput,
  EvalInput,
  HitlGateInput,
  IngestInput,
  LoopInput,
  RagInput,
} from "../recipes/types";
import type { DiagnosticEntry } from "./diagnostics";
import type { ExplainSnapshot } from "./explain";

// Recipe inputs + artefacts
export type { AgentInput, RagInput, EvalInput, HitlGateInput, LoopInput, IngestInput };

export type RecipeContracts = {
  agent: { input: AgentInput; artefact: Record<string, unknown>; resumeInput?: AgentInput };
  rag: { input: RagInput; artefact: Record<string, unknown>; resumeInput?: never };
  eval: { input: EvalInput; artefact: Record<string, unknown>; resumeInput?: never };
  "hitl-gate": {
    input: HitlGateInput;
    artefact: Record<string, unknown>;
    resumeInput: HitlGateInput;
  };
  loop: { input: LoopInput; artefact: Record<string, unknown>; resumeInput?: LoopInput };
  ingest: { input: IngestInput; artefact: Record<string, unknown>; resumeInput?: never };
};

export type RecipeName = keyof RecipeContracts;

export type RunInputOf<N extends RecipeName> = RecipeContracts[N]["input"];
export type ArtefactOf<N extends RecipeName> = RecipeContracts[N]["artefact"];
export type ResumeInputOf<N extends RecipeName> = NonNullable<
  RecipeContracts[N] extends { resumeInput?: infer H } ? H : never
>;

// Pipeline run types
export type RunOptions = {
  input: unknown;
  reporter?: PipelineReporter;
  runtime?: Runtime;
  adapters?: AdapterBundle;
};

export type PipelineContext = {
  reporter: PipelineReporter;
  runtime?: Runtime;
  adapters?: AdapterBundle;
};

export type PipelineState = Record<string, unknown>;

// Contracts + plugins
export type RecipeConstructs = {
  required?: string[];
  optional?: string[];
  providers?: Record<string, string>;
  dependsOn?: Record<string, string[]>;
};

export type RecipeContract = {
  name: RecipeName;
  artefactKeys: string[];
  outcomes: Array<"ok" | "paused" | "error">;
  extensionPoints: string[];
  minimumCapabilities: string[];
  helperKinds?: string[];
  supportsResume?: boolean;
  defaultPlugins?: Plugin[];
  constructs?: RecipeConstructs;
};

export type Plugin = {
  key: string;
  mode?: "extend" | "override";
  overrideKey?: string;
  capabilities?: Record<string, unknown>;
  requires?: string[];
  emits?: string[];
  helperKinds?: string[];
  adapters?: AdapterBundle;
  lifecycle?: string;
  hook?: PipelineExtensionHook<unknown, unknown, unknown>;
  register?: (
    pipeline: unknown,
  ) => MaybePromise<PipelineExtensionRegisterOutput<unknown, unknown, unknown>>;
};

// Runtime construction
export type RuntimeDeps<N extends RecipeName> = {
  contract: RecipeContract & { name: N };
  plugins: Plugin[];
  diagnostics?: DiagnosticEntry[];
  pipelineFactory?: (
    contract: RecipeContract & { name: N },
    plugins: Plugin[],
  ) => PipelineWithExtensions;
};

export type PipelineWithExtensions = {
  extensions: {
    use: (extension: unknown) => unknown;
  };
  run: (options: RunOptions) => MaybePromise<unknown>;
  resume?: (
    snapshot: PipelinePauseSnapshot<unknown>,
    resumeInput?: unknown,
  ) => MaybePromise<unknown>;
};

// Explain/capabilities
export type CapabilitiesSnapshot = {
  declared: Record<string, unknown>;
  resolved: Record<string, unknown>;
};

export type ExplainInput = {
  plugins: Plugin[];
  declaredCapabilities: Record<string, unknown>;
  resolvedCapabilities: Record<string, unknown>;
};

export type Outcome<TArtefact = unknown> =
  | { status: "ok"; artefact: TArtefact; trace: unknown[]; diagnostics: unknown[] }
  | {
      status: "paused";
      token: unknown;
      artefact: Partial<TArtefact>;
      trace: unknown[];
      diagnostics: unknown[];
    }
  | { status: "error"; error: unknown; trace: unknown[]; diagnostics: unknown[] };

export type WorkflowRuntime<TRunInput = unknown, TArtefact = unknown, TResumeInput = unknown> = {
  run(input: TRunInput, runtime?: Runtime): MaybePromise<Outcome<TArtefact>>;
  resume?(
    token: unknown,
    resumeInput?: TResumeInput,
    runtime?: Runtime,
  ): MaybePromise<Outcome<TArtefact>>;
  capabilities(): MaybePromise<Record<string, unknown>>;
  declaredCapabilities(): Record<string, unknown>;
  adapters(): MaybePromise<AdapterBundle>;
  declaredAdapters(): AdapterBundle;
  explain(): ExplainSnapshot;
  contract(): RecipeContract;
};

// Outcome helpers
export type OutcomeMatcher<TArtefact, TResult> = {
  ok: (outcome: Extract<Outcome<TArtefact>, { status: "ok" }>) => TResult;
  paused: (outcome: Extract<Outcome<TArtefact>, { status: "paused" }>) => TResult;
  error: (outcome: Extract<Outcome<TArtefact>, { status: "error" }>) => TResult;
};

export type Runtime = {
  reporter?: PipelineReporter;
  diagnostics?: "default" | "strict";
  budget?: unknown;
  persistence?: unknown;
  traceSink?: unknown;
  resume?: AdapterResume;
  providers?: Record<string, string>;
  retryDefaults?: RetryConfig;
  retry?: RetryConfig;
};

// PipelineReporter is imported for Runtime typing; do not re-export to avoid drift.
