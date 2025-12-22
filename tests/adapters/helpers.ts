import type {
  AdapterMessage,
  AdapterMessagePart,
  AdapterModelCall,
  AdapterSchema,
} from "#adapters";
import { Tool, type AdapterTool } from "#adapters";
import type { ModelMessage, Prompt } from "ai";

export const isPromiseLike = (value: unknown): value is Promise<unknown> =>
  !!value && typeof (value as Promise<unknown>).then === "function";

export const assertSyncValue = <T>(value: T | Promise<T>) => {
  if (isPromiseLike(value)) {
    throw new Error("Expected a synchronous value, got a Promise.");
  }
  return value;
};

export const makeMessage = (overrides: Partial<AdapterMessage> = {}): AdapterMessage => ({
  role: "user",
  content: "hello",
  ...overrides,
});

export const makeStructuredContent = (parts: AdapterMessagePart[], text = "") => ({
  text,
  parts,
});

export const makeModelCall = (overrides: Partial<AdapterModelCall> = {}): AdapterModelCall => {
  const base: AdapterModelCall = { prompt: "hello" };
  if (overrides.messages) {
    base.messages = overrides.messages;
  }
  if (overrides.prompt !== undefined) {
    base.prompt = overrides.prompt;
  }
  return { ...base, ...overrides };
};

export const makeSchema = (
  jsonSchema: AdapterSchema["jsonSchema"],
  kind: AdapterSchema["kind"] = "json-schema",
): AdapterSchema => ({
  jsonSchema,
  kind,
});

export const makeTool = (overrides: Partial<AdapterTool> = {}): AdapterTool =>
  Tool.create({
    name: "tool",
    ...overrides,
  });

export const makeToolParam = (
  name: string,
  type: string,
  options: { description?: string; required?: boolean } = {},
) => Tool.param(name, type, options);

export const makeUsage = (inputTokens: number, outputTokens: number) => ({
  inputTokens,
  outputTokens,
  totalTokens: inputTokens + outputTokens,
});

export const asModelMessage = (message: Partial<AdapterMessage>) =>
  ({
    role: "user",
    content: "hello",
    ...message,
  }) satisfies AdapterMessage;

export const asLlamaChatMessage = (message: unknown) =>
  ({
    role: "user",
    content: "hello",
    ...(message as object),
  }) as import("@llamaindex/core/llms").ChatMessage;

export const asLangChainRetriever = (invoke: () => unknown) =>
  ({ invoke }) as unknown as import("@langchain/core/retrievers").BaseRetrieverInterface;

export const asLlamaIndexRetriever = (retrieve: () => unknown) =>
  ({ retrieve }) as unknown as import("@llamaindex/core/retriever").BaseRetriever;

export const asLangChainLoader = (loader: unknown) =>
  loader as import("@langchain/core/document_loaders/base").BaseDocumentLoader;

export const asLlamaIndexReader = (reader: unknown) =>
  reader as import("@llamaindex/core/schema").BaseReader;

export const asLangChainStore = (store: unknown) =>
  store as import("@langchain/core/stores").BaseStore<string, unknown>;

export const asLlamaIndexDocStore = (store: unknown) =>
  store as import("@llamaindex/core/storage/doc-store").BaseDocumentStore;

export const asLangChainMemory = (memory: unknown) =>
  memory as import("@langchain/core/memory").BaseMemory;

export const asLlamaIndexMemory = (memory: unknown) =>
  memory as import("@llamaindex/core/memory").Memory;

export const asLangChainEmbeddings = (embeddings: unknown) =>
  embeddings as import("@langchain/core/embeddings").EmbeddingsInterface<number[]>;

export const asLlamaIndexEmbeddings = (embedding: unknown) =>
  embedding as import("@llamaindex/core/embeddings").BaseEmbedding;

export const asLlamaPromptTemplate = (prompt: unknown) =>
  prompt as import("@llamaindex/core/prompts").PromptTemplate;

export const asLlamaIndexPostprocessor = (postprocessor: unknown) =>
  postprocessor as import("@llamaindex/core/postprocessor").BaseNodePostprocessor;

export const asLlamaIndexParser = (parser: unknown) =>
  parser as import("@llamaindex/core/node-parser").NodeParser;

export const asAiSdkMessage = (message: unknown) => message as ModelMessage;

export const asAiSdkPrompt = (prompt: unknown) => prompt as Prompt;

export const asLlamaIndexModel = (model: unknown) => model as import("@llamaindex/core/llms").LLM;
