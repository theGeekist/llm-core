import type {
  AdapterCallContext,
  AdapterDiagnostic,
  Document,
  RetrievalQuery,
  Tool,
  Turn,
} from "./types";
import { toQueryText } from "./retrieval-query";
import { warnDiagnostic } from "./utils";

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
    return [warnDiagnostic("retriever_query_missing")];
  }
  return [];
};

export const validateRerankerInput = (
  query: RetrievalQuery | undefined,
  documents: Document[] | undefined,
) => {
  const diagnostics: AdapterDiagnostic[] = [];
  if (!documents || documents.length === 0) {
    diagnostics.push(warnDiagnostic("reranker_documents_missing"));
  }
  const text = toQueryText(query ?? "");
  if (isBlank(text)) {
    diagnostics.push(warnDiagnostic("reranker_query_missing"));
  }
  return diagnostics;
};

export const validateTextSplitterInput = (text: string | undefined) => {
  if (!text || isBlank(text)) {
    return [warnDiagnostic("text_splitter_input_missing")];
  }
  return [];
};

export const validateTextSplitterBatchInput = (texts: string[] | undefined) => {
  if (!texts || texts.length === 0 || texts.every((text) => isBlank(text))) {
    return [warnDiagnostic("text_splitter_input_missing")];
  }
  return [];
};

export const validateTransformerInput = (documents: Document[] | undefined) => {
  if (!documents || documents.length === 0) {
    return [warnDiagnostic("transformer_documents_missing")];
  }
  return [];
};

export const validateVectorStoreUpsertInput = (input: unknown) => {
  if (!input) {
    return [warnDiagnostic("vector_store_input_missing")];
  }
  if (typeof input !== "object") {
    return [warnDiagnostic("vector_store_input_missing")];
  }
  const record = input as { documents?: Document[]; vectors?: Array<{ values?: number[] }> };
  if (record.documents) {
    if (record.documents.length === 0) {
      return [warnDiagnostic("vector_store_documents_missing")];
    }
    return [];
  }
  if (record.vectors) {
    if (record.vectors.length === 0) {
      return [warnDiagnostic("vector_store_vectors_missing")];
    }
    return [];
  }
  return [warnDiagnostic("vector_store_input_missing")];
};

export const validateVectorStoreDeleteInput = (input: unknown) => {
  if (!input) {
    return [warnDiagnostic("vector_store_delete_missing")];
  }
  if (typeof input !== "object") {
    return [warnDiagnostic("vector_store_delete_missing")];
  }
  const record = input as { ids?: string[]; filter?: Record<string, unknown> };
  if (record.ids) {
    if (record.ids.length === 0 || record.ids.every((id) => isBlank(id))) {
      return [warnDiagnostic("vector_store_delete_ids_missing")];
    }
    return [];
  }
  if (record.filter) {
    if (Object.keys(record.filter).length === 0) {
      return [warnDiagnostic("vector_store_delete_filter_missing")];
    }
    return [];
  }
  return [warnDiagnostic("vector_store_delete_missing")];
};

export const validateEmbedderInput = (text: string | undefined) => {
  if (!text || isBlank(text)) {
    return [warnDiagnostic("embedder_input_missing")];
  }
  return [];
};

export const validateEmbedderBatchInput = (texts: string[] | undefined) => {
  if (!texts || texts.length === 0 || texts.every((text) => isBlank(text))) {
    return [warnDiagnostic("embedder_input_missing")];
  }
  return [];
};

export const validateImageInput = (prompt: string | undefined) => {
  if (!prompt || isBlank(prompt)) {
    return [warnDiagnostic("image_prompt_missing")];
  }
  return [];
};

export const validateSpeechInput = (text: string | undefined) => {
  if (!text || isBlank(text)) {
    return [warnDiagnostic("speech_text_missing")];
  }
  return [];
};

export const validateTranscriptionInput = (
  audio: { bytes?: Uint8Array; contentType?: string } | undefined,
) => {
  const diagnostics: AdapterDiagnostic[] = [];
  if (!audio?.bytes || audio.bytes.length === 0) {
    diagnostics.push(warnDiagnostic("transcription_audio_missing"));
  }
  if (!audio?.contentType) {
    diagnostics.push(warnDiagnostic("transcription_media_type_missing"));
  }
  return diagnostics;
};

export const validateToolInput = (tool: Tool, input: unknown) => {
  const needsInput = Boolean(tool.inputSchema) || (tool.params?.length ?? 0) > 0;
  if (needsInput && (input === undefined || input === null)) {
    return [warnDiagnostic("tool_input_missing", { tool: tool.name })];
  }
  return [];
};

export const validateStorageKey = (key: string | undefined, action: string) => {
  if (!key || isBlank(key)) {
    return [warnDiagnostic("storage_key_missing", { action })];
  }
  return [];
};

export const validateKvKeys = (keys: string[] | undefined, action: string) => {
  if (!keys || keys.length === 0 || keys.every((key) => isBlank(key))) {
    return [warnDiagnostic("kv_keys_missing", { action })];
  }
  return [];
};

export const validateKvPairs = (pairs: Array<[string, unknown]> | undefined) => {
  if (!pairs || pairs.length === 0) {
    return [warnDiagnostic("kv_pairs_missing")];
  }
  return [];
};

export const validateThreadId = (threadId: string | undefined, action: string) => {
  if (!threadId || isBlank(threadId)) {
    return [warnDiagnostic("memory_thread_missing", { action })];
  }
  return [];
};

export const validateMemoryLoadInput = (input: Record<string, unknown> | undefined) => {
  if (!input) {
    return [warnDiagnostic("memory_input_missing")];
  }
  return [];
};

export const validateMemorySaveInput = (
  input: Record<string, unknown> | undefined,
  output: Record<string, unknown> | undefined,
) => {
  const diagnostics: AdapterDiagnostic[] = [];
  if (!input) {
    diagnostics.push(warnDiagnostic("memory_input_missing"));
  }
  if (!output) {
    diagnostics.push(warnDiagnostic("memory_output_missing"));
  }
  return diagnostics;
};

export const validateMemoryTurn = (turn: Turn | undefined) => {
  if (!turn) {
    return [warnDiagnostic("memory_turn_missing")];
  }
  return [];
};

export const validateMemoryProvider = (method: string, action: string) => [
  warnDiagnostic("memory_provider_missing", { action, method }),
];
