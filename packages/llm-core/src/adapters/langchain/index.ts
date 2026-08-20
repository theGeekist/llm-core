import type { Retriever } from "../../features/retrieval/public";
import { createLangChainRetriever as createRetriever } from "./retrieval";

export interface LangChainRetrieverDocument {
  readonly id?: string;
  readonly pageContent: string;
  readonly metadata: Record<string, unknown>;
}

export interface LangChainRetriever {
  invoke(query: string): LangChainRetrieverDocument[] | PromiseLike<LangChainRetrieverDocument[]>;
}

export const createLangChainRetriever = (retriever: LangChainRetriever): Retriever =>
  createRetriever(retriever as never);
