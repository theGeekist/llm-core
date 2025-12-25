import type {
  AdapterCallContext,
  AdapterDiagnostic,
  Message,
  MessagePart,
  ModelCall,
  Schema,
} from "#adapters";
import { Tooling, type Tool } from "#adapters";
import type { ModelMessage, Prompt } from "ai";

export const isPromiseLike = (value: unknown): value is Promise<unknown> =>
  !!value && typeof (value as Promise<unknown>).then === "function";

export const assertSyncValue = <T>(value: T | Promise<T>) => {
  if (isPromiseLike(value)) {
    throw new Error("Expected a synchronous value, got a Promise.");
  }
  return value;
};

export const captureDiagnostics = () => {
  const diagnostics: AdapterDiagnostic[] = [];
  const context: AdapterCallContext = {
    report: (diagnostic) => {
      diagnostics.push(diagnostic);
    },
  };
  return { context, diagnostics };
};

export const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  role: "user",
  content: "hello",
  ...overrides,
});

export const makeStructuredContent = (parts: MessagePart[], text = "") => ({
  text,
  parts,
});

export const makeModelCall = (overrides: Partial<ModelCall> = {}): ModelCall => {
  const base: ModelCall = { prompt: "hello" };
  if (overrides.messages) {
    base.messages = overrides.messages;
  }
  if (overrides.prompt !== undefined) {
    base.prompt = overrides.prompt;
  }
  return { ...base, ...overrides };
};

export const makeSchema = (
  jsonSchema: Schema["jsonSchema"],
  kind: Schema["kind"] = "json-schema",
): Schema => ({
  jsonSchema,
  kind,
});

export const makeTool = (overrides: Partial<Tool> = {}): Tool =>
  Tooling.create({
    name: "tool",
    ...overrides,
  });

export const makeToolParam = (
  name: string,
  type: string,
  options: { description?: string; required?: boolean } = {},
) => Tooling.param(name, type, options);

export const makeUsage = (inputTokens: number, outputTokens: number) => ({
  inputTokens,
  outputTokens,
  totalTokens: inputTokens + outputTokens,
});

export const asModelMessage = (message: Partial<Message>) =>
  ({
    role: "user",
    content: "hello",
    ...message,
  }) satisfies Message;

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

export const asLangChainVectorStore = (store: unknown) =>
  store as import("@langchain/core/vectorstores").VectorStoreInterface;

export const asLlamaIndexVectorStore = (store: unknown) =>
  store as import("@llamaindex/core/vector-store").BaseVectorStore;

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

export const asAiSdkImageModel = (model: unknown) =>
  model as import("@ai-sdk/provider").ImageModelV2;

export const asAiSdkSpeechModel = (model: unknown) =>
  model as import("@ai-sdk/provider").SpeechModelV2;

export const asAiSdkTranscriptionModel = (model: unknown) =>
  model as import("@ai-sdk/provider").TranscriptionModelV2;

export const asAiSdkReranker = (model: unknown) =>
  model as import("@ai-sdk/provider").RerankingModelV3;

export const asLlamaIndexModel = (model: unknown) => model as import("@llamaindex/core/llms").LLM;
