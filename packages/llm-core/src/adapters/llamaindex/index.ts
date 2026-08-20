import type { Retriever } from "../../features/retrieval/public";
import { createLlamaIndexRetriever as createRetriever } from "./retrieval";

export interface LlamaIndexRetrieverNode {
  readonly id_?: string;
  readonly metadata: Record<string, unknown>;
  getContent(metadataMode?: unknown): string;
}

export interface LlamaIndexRetrieverNodeWithScore {
  readonly node: LlamaIndexRetrieverNode;
  readonly score?: number;
}

export interface LlamaIndexRetriever {
  retrieve(
    query: string,
  ): LlamaIndexRetrieverNodeWithScore[] | PromiseLike<LlamaIndexRetrieverNodeWithScore[]>;
}

export const createLlamaIndexRetriever = (retriever: LlamaIndexRetriever): Retriever =>
  createRetriever(retriever as never);
