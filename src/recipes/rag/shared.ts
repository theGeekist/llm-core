import type { Document, Model, RetrievalResult, Retriever, Reranker } from "../../adapters/types";
import { toQueryText } from "../../adapters/retrieval-query";
import { bindFirst } from "../../shared/fp";
import { maybeMap } from "../../shared/maybe";
import type { PipelineContext, PipelineState } from "../../workflow/types";
import type { RagInput } from "../types";

const RAG_STATE_KEY = "rag";

export type RagState = {
  input?: string;
  query?: string;
  documents?: Document[];
  response?: string;
};

const readInputRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;

const readString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const readRagInput = (value: unknown): RagInput => {
  const record = readInputRecord(value);
  return {
    input: readString(record?.input),
    query: readString(record?.query),
  };
};

const readRagState = (state: PipelineState): RagState => {
  const raw = state[RAG_STATE_KEY];
  if (raw && typeof raw === "object") {
    return raw as RagState;
  }
  const fresh: RagState = {};
  state[RAG_STATE_KEY] = fresh;
  return fresh;
};

const setRagInput = (rag: RagState, input: RagInput) => {
  if (input.input !== undefined) {
    rag.input = input.input;
  }
  if (input.query !== undefined) {
    rag.query = input.query;
  }
};

const resolveQuery = (rag: RagState) => rag.query ?? rag.input ?? "";

const readModel = (context: PipelineContext): Model | null | undefined => context.adapters?.model;

const readRetriever = (context: PipelineContext): Retriever | null | undefined =>
  context.adapters?.retriever;

const readReranker = (context: PipelineContext): Reranker | null | undefined =>
  context.adapters?.reranker;

const readDocumentText = (doc: Document) => doc.text;

const formatDocuments = (documents: Document[]) => documents.map(readDocumentText).join("\n---\n");

const buildPrompt = (rag: RagState) => {
  const query = resolveQuery(rag);
  const docs = rag.documents ? formatDocuments(rag.documents) : "";
  return docs ? `${query}\n\nContext:\n${docs}` : query;
};

const applyRetrievedDocuments = (rag: RagState, result: RetrievalResult) => {
  rag.documents = result.documents;
  return result.documents;
};

const applyRerankedDocuments = (rag: RagState, documents: Document[] | undefined) => {
  if (documents) {
    rag.documents = documents;
  }
  return null;
};

const runRerank = (reranker: Reranker | null | undefined, query: string, documents: Document[]) => {
  if (!reranker) {
    return documents;
  }
  return reranker.rerank(toQueryText(query), documents);
};

type RetrieveContext = {
  rag: RagState;
  query: string;
  reranker: Reranker | null | undefined;
};

const createRetrieveContext = (
  rag: RagState,
  query: string,
  reranker: Reranker | null | undefined,
): RetrieveContext => ({
  rag,
  query,
  reranker,
});

const handleRetrieved = (context: RetrieveContext, result: RetrievalResult) =>
  maybeMap(
    bindFirst(applyRerankedDocuments, context.rag),
    runRerank(context.reranker, context.query, applyRetrievedDocuments(context.rag, result)),
  );

type RunRetrieveInput = {
  retriever: Retriever | null | undefined;
  query: string;
  rag: RagState;
  reranker: Reranker | null | undefined;
};

const runRetrieve = (input: RunRetrieveInput) => {
  if (!input.retriever) {
    return null;
  }
  return maybeMap(
    bindFirst(handleRetrieved, createRetrieveContext(input.rag, input.query, input.reranker)),
    input.retriever.retrieve(toQueryText(input.query)),
  );
};

const runModel = (model: Model | null | undefined, prompt: string) => {
  if (!model) {
    return null;
  }
  return model.generate({ prompt });
};

const applyModelResponse = (rag: RagState, result: { text?: string | null } | undefined) => {
  if (result?.text != null) {
    rag.response = result.text;
  }
  return null;
};

export const RagStateHelpers = {
  readRagInput,
  readRagState,
  setRagInput,
  resolveQuery,
  readModel,
  readRetriever,
  readReranker,
  buildPrompt,
  runRetrieve,
  runModel,
  applyModelResponse,
};
