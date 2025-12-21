// References: docs/implementation-plan.md#L25-L42; docs/workflow-notes.md

import type {
  MaybePromise,
  PipelineExtensionHook,
  PipelineExtensionRegisterOutput,
  PipelineReporter,
} from "@wpkernel/pipeline/core";
import type { AdapterBundle } from "../adapters/types";
import type { ExplainSnapshot } from "./explain";

// Recipe inputs + artefacts
export type AgentInput = { input: string; context?: string };
export type RagInput = { input: string; query?: string; topK?: number };
export type EvalInput = { prompt: string; datasetId?: string; candidates?: number };
export type HitlGateInput = { input: string; policy?: string };
export type LoopInput = { input: string; maxIterations?: number };
export type IngestInput = {
  sourceId: string;
  documents: Array<{ id: string; text: string }>;
  chunking?: "default" | "byHeading";
};

export type AgentHumanInput = { decision: "approve" | "deny" | "edit"; notes?: string };
export type HitlGateHumanInput = { decision: string; notes?: string };

export type RecipeContracts = {
  agent: { input: AgentInput; artefact: Record<string, unknown>; humanInput?: AgentHumanInput };
  rag: { input: RagInput; artefact: Record<string, unknown>; humanInput?: never };
  eval: { input: EvalInput; artefact: Record<string, unknown>; humanInput?: never };
  "hitl-gate": {
    input: HitlGateInput;
    artefact: Record<string, unknown>;
    humanInput: HitlGateHumanInput;
  };
  loop: { input: LoopInput; artefact: Record<string, unknown>; humanInput?: unknown };
  ingest: { input: IngestInput; artefact: Record<string, unknown>; humanInput?: never };
};

export type RecipeName = keyof RecipeContracts;

export type RunInputOf<N extends RecipeName> = RecipeContracts[N]["input"];
export type ArtefactOf<N extends RecipeName> = RecipeContracts[N]["artefact"];
export type HumanInputOf<N extends RecipeName> = NonNullable<
  RecipeContracts[N] extends { humanInput?: infer H } ? H : never
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
export type RecipeContract = {
  name: RecipeName;
  artefactKeys: string[];
  outcomes: Array<"ok" | "needsHuman" | "error">;
  extensionPoints: string[];
  minimumCapabilities: string[];
  helperKinds?: string[];
  supportsResume?: boolean;
  defaultPlugins?: Plugin[];
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
      status: "needsHuman";
      token: unknown;
      artefact: Partial<TArtefact>;
      trace: unknown[];
      diagnostics: unknown[];
    }
  | { status: "error"; error: unknown; trace: unknown[]; diagnostics: unknown[] };

export type WorkflowRuntime<TRunInput = unknown, TArtefact = unknown, THumanInput = unknown> = {
  run(input: TRunInput, runtime?: Runtime): MaybePromise<Outcome<TArtefact>>;
  resume?(
    token: unknown,
    humanInput?: THumanInput,
    runtime?: Runtime,
  ): MaybePromise<Outcome<TArtefact>>;
  capabilities(): Record<string, unknown>;
  adapters(): AdapterBundle;
  explain(): ExplainSnapshot;
  contract(): RecipeContract;
};

// Outcome helpers
export type OutcomeMatcher<TArtefact, TResult> = {
  ok: (outcome: Extract<Outcome<TArtefact>, { status: "ok" }>) => TResult;
  needsHuman: (outcome: Extract<Outcome<TArtefact>, { status: "needsHuman" }>) => TResult;
  error: (outcome: Extract<Outcome<TArtefact>, { status: "error" }>) => TResult;
};

export type Runtime = {
  reporter?: PipelineReporter;
  diagnostics?: "default" | "strict";
  budget?: unknown;
  persistence?: unknown;
  traceSink?: unknown;
  hitl?: unknown;
};

// PipelineReporter is imported for Runtime typing; do not re-export to avoid drift.
