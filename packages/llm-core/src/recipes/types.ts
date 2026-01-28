import type { Document } from "#adapters/types";

export type AgentInput = {
  input?: string;
  context?: string;
  threadId?: string;
};

export type RagInput = {
  input?: string;
  query?: string;
};

export type EvalInput = {
  prompt: string;
  datasetId?: string;
  candidates?: number;
  dataset?: {
    rows?: string[];
  };
};

export type HitlGateInput = {
  input?: string;
  policy?: string;
  decision?: string;
  notes?: string;
  answer?: string;
};

export type LoopInput = {
  input: string;
  maxIterations?: number;
};

export type IngestInput = {
  sourceId?: string;
  documents?: Document[];
  chunking?: "default" | "byHeading";
};
