// References: docs/implementation-plan.md#L25-L42; docs/workflow-notes.md

import type { MaybePromise, PipelineExtensionHook, PipelineExtensionRegisterOutput, PipelineReporter } from "@wpkernel/pipeline";

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
export type HumanInputOf<N extends RecipeName> =
  NonNullable<RecipeContracts[N] extends { humanInput?: infer H } ? H : never>;

export type RecipeContract = {
  name: RecipeName;
  artefactKeys: string[];
  outcomes: Array<"ok" | "needsHuman" | "error">;
  extensionPoints: string[];
  minimumCapabilities: string[];
  helperKinds?: string[];
};

export type Plugin = {
  key: string;
  mode?: "extend" | "override";
  overrideKey?: string;
  capabilities?: Record<string, unknown>;
  requires?: string[];
  emits?: string[];
  helperKinds?: string[];
  lifecycle?: string;
  hook?: PipelineExtensionHook<unknown, unknown, unknown>;
  register?: (pipeline: unknown) => MaybePromise<PipelineExtensionRegisterOutput<unknown, unknown, unknown>>;
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

export type Runtime = {
  reporter?: PipelineReporter;
  budget?: unknown;
  persistence?: unknown;
  traceSink?: unknown;
  hitl?: unknown;
};

// PipelineReporter is imported for Runtime typing; do not re-export to avoid drift.
