import type {
  AdapterCallContext,
  AdapterDiagnostic,
  Document,
  RetrievalQuery,
  Tool,
  Turn,
} from "./types";
import { toQueryText } from "./retrieval-query";

const warn = (message: string, data?: Record<string, unknown>): AdapterDiagnostic => ({
  level: "warn",
  message,
  data: data ? { code: message, ...data } : { code: message },
});

const isBlank = (value: string) => value.trim().length === 0;

export const reportDiagnostics = (
  context: AdapterCallContext | undefined,
  diagnostics: AdapterDiagnostic[],
) => {
  if (!context?.report) {
    return;
  }
  for (const diagnostic of diagnostics) {
    context.report(diagnostic);
  }
};

export const validateRetrieverInput = (query: RetrievalQuery | undefined) => {
  const text = toQueryText(query ?? "");
  if (isBlank(text)) {
    return [warn("retriever_query_missing")];
  }
  return [];
};

export const validateRerankerInput = (
  query: RetrievalQuery | undefined,
  documents: Document[] | undefined,
) => {
  const diagnostics: AdapterDiagnostic[] = [];
  if (!documents || documents.length === 0) {
    diagnostics.push(warn("reranker_documents_missing"));
  }
  const text = toQueryText(query ?? "");
  if (isBlank(text)) {
    diagnostics.push(warn("reranker_query_missing"));
  }
  return diagnostics;
};

export const validateTextSplitterInput = (text: string | undefined) => {
  if (!text || isBlank(text)) {
    return [warn("text_splitter_input_missing")];
  }
  return [];
};

export const validateTextSplitterBatchInput = (texts: string[] | undefined) => {
  if (!texts || texts.length === 0 || texts.every((text) => isBlank(text))) {
    return [warn("text_splitter_input_missing")];
  }
  return [];
};

export const validateTransformerInput = (documents: Document[] | undefined) => {
  if (!documents || documents.length === 0) {
    return [warn("transformer_documents_missing")];
  }
  return [];
};

export const validateEmbedderInput = (text: string | undefined) => {
  if (!text || isBlank(text)) {
    return [warn("embedder_input_missing")];
  }
  return [];
};

export const validateEmbedderBatchInput = (texts: string[] | undefined) => {
  if (!texts || texts.length === 0 || texts.every((text) => isBlank(text))) {
    return [warn("embedder_input_missing")];
  }
  return [];
};

export const validateToolInput = (tool: Tool, input: unknown) => {
  const needsInput = Boolean(tool.inputSchema) || (tool.params?.length ?? 0) > 0;
  if (needsInput && (input === undefined || input === null)) {
    return [warn("tool_input_missing", { tool: tool.name })];
  }
  return [];
};

export const validateStorageKey = (key: string | undefined, action: string) => {
  if (!key || isBlank(key)) {
    return [warn("storage_key_missing", { action })];
  }
  return [];
};

export const validateKvKeys = (keys: string[] | undefined, action: string) => {
  if (!keys || keys.length === 0 || keys.every((key) => isBlank(key))) {
    return [warn("kv_keys_missing", { action })];
  }
  return [];
};

export const validateKvPairs = (pairs: Array<[string, unknown]> | undefined) => {
  if (!pairs || pairs.length === 0) {
    return [warn("kv_pairs_missing")];
  }
  return [];
};

export const validateThreadId = (threadId: string | undefined, action: string) => {
  if (!threadId || isBlank(threadId)) {
    return [warn("memory_thread_missing", { action })];
  }
  return [];
};

export const validateMemoryLoadInput = (input: Record<string, unknown> | undefined) => {
  if (!input) {
    return [warn("memory_input_missing")];
  }
  return [];
};

export const validateMemorySaveInput = (
  input: Record<string, unknown> | undefined,
  output: Record<string, unknown> | undefined,
) => {
  const diagnostics: AdapterDiagnostic[] = [];
  if (!input) {
    diagnostics.push(warn("memory_input_missing"));
  }
  if (!output) {
    diagnostics.push(warn("memory_output_missing"));
  }
  return diagnostics;
};

export const validateMemoryTurn = (turn: Turn | undefined) => {
  if (!turn) {
    return [warn("memory_turn_missing")];
  }
  return [];
};
