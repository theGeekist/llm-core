import type { Model, Message, ModelResult, ModelCall } from "../../src/adapters/types";
import type { Embedder, TextSplitter, VectorStore, Retriever } from "../../src/adapters/types";
import type { InteractionState, SessionId } from "../../src/interaction/types";

export const createMockModelResult = (text: string): ModelResult => ({
  text,
});

export const createMockModel = (
  textOrHandler:
    | string
    | ((call: ModelCall, options?: unknown) => ModelResult | Promise<ModelResult>),
): Model => ({
  generate:
    typeof textOrHandler === "string" ? () => createMockModelResult(textOrHandler) : textOrHandler,
});

export const createMockMessage = (content: string, role: Message["role"] = "user"): Message => ({
  role,
  content,
});

export const createMockInteractionState = (messages: Message[] = []): InteractionState => ({
  messages,
  diagnostics: [],
  trace: [],
});

export const createMockSessionStore = () => {
  const sessions = new Map<string, InteractionState>();
  const calls = { load: 0, save: 0, contexts: [] as unknown[] };

  const toSessionKey = (sessionId: SessionId) => {
    if (typeof sessionId === "string") {
      return sessionId;
    }
    return sessionId.userId ? `${sessionId.sessionId}:${sessionId.userId}` : sessionId.sessionId;
  };

  return {
    sessions,
    calls,
    store: {
      load: (sessionId: SessionId, context?: unknown) => {
        calls.load += 1;
        if (context) calls.contexts.push(context);
        return sessions.get(toSessionKey(sessionId)) ?? null;
      },
      save: (sessionId: SessionId, state: InteractionState, context?: unknown) => {
        calls.save += 1;
        if (context) calls.contexts.push(context);
        sessions.set(toSessionKey(sessionId), state);
        return true;
      },
    },
  };
};

// --- Ingest / RAG Fixtures ---

export const createMockSplitter = (withMetadata = false): TextSplitter => ({
  split: (text) => [text],
  splitWithMetadata: withMetadata
    ? (text) => [{ text, metadata: { source: "test-meta" } }]
    : undefined,
});

export const createMockEmbedder = (values = [0.1, 0.2, 0.3], withEmbedMany = false): Embedder => ({
  embed: () => values,
  embedMany: withEmbedMany ? (texts) => texts.map(() => values) : undefined,
});


type UpsertInput = { documents?: unknown; vectors?: unknown };

export const createMockVectorStore = () => {
  const calls: Array<UpsertInput> = [];
  const store: VectorStore = {
    upsert: (input) => {
      const typedInput = input as UpsertInput;
      calls.push({
        documents: typedInput.documents,
        vectors: typedInput.vectors,
      });
      return null;
    },
    delete: () => null,
  };
  return { store, calls };
};

export const createMockRetriever = (
  documents = [{ text: "doc-one" }, { text: "doc-two" }],
): Retriever => ({
  retrieve: (query) => ({
    query,
    documents,
  }),
});
