import type {
  AgentInput,
  EvalInput,
  HitlGateInput,
  IngestInput,
  LoopInput,
  RagInput,
} from "./types";

export type AgentInputOptions = {
  text?: string;
  context?: string;
  threadId?: string;
};

export type ChatSimpleInputOptions = {
  text?: string;
  threadId?: string;
};

export type RagInputOptions = {
  text?: string;
  query?: string;
};

export type HitlInputOptions = {
  text?: string;
  policy?: string;
  decision?: string;
  notes?: string;
  answer?: string;
};

export type LoopInputOptions = {
  text: string;
  maxIterations?: number;
};

export type IngestInputOptions = {
  sourceId?: string;
  documents?: IngestInput["documents"];
  chunking?: IngestInput["chunking"];
};

export type EvalInputOptions = {
  prompt: string;
  datasetId?: string;
  candidates?: number;
  dataset?: EvalInput["dataset"];
};

export const toAgentInput = (input: AgentInputOptions): AgentInput => ({
  input: input.text,
  context: input.context,
  threadId: input.threadId,
});

const readRagInputText = (input: RagInputOptions) => input.text ?? input.query;

const readRagQuery = (input: RagInputOptions) => input.query ?? input.text;

export const toRagInput = (input: RagInputOptions): RagInput => ({
  input: readRagInputText(input),
  query: readRagQuery(input),
});

export const toHitlInput = (input: HitlInputOptions): HitlGateInput => ({
  input: input.text,
  policy: input.policy,
  decision: input.decision,
  notes: input.notes,
  answer: input.answer,
});

export const toLoopInput = (input: LoopInputOptions): LoopInput => ({
  input: input.text,
  maxIterations: input.maxIterations,
});

export const toIngestInput = (input: IngestInputOptions): IngestInput => ({
  sourceId: input.sourceId,
  documents: input.documents,
  chunking: input.chunking,
});

export const toEvalInput = (input: EvalInputOptions): EvalInput => ({
  prompt: input.prompt,
  datasetId: input.datasetId,
  candidates: input.candidates,
  dataset: input.dataset,
});

export const toChatSimpleInput = (input: ChatSimpleInputOptions): AgentInput => ({
  input: input.text,
  threadId: input.threadId,
});

export const inputs = {
  agent: toAgentInput,
  rag: toRagInput,
  hitl: toHitlInput,
  loop: toLoopInput,
  ingest: toIngestInput,
  eval: toEvalInput,
  chatSimple: toChatSimpleInput,
};
