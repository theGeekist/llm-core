import { describe, expect, test } from "bun:test";
import { capabilityIdForPort } from "../../../src/application/capability-bindings/public";
import { ADAPTER_CATALOGUE } from "../../../src/composition/capability-bindings/public";

const expectedImplementationOperations = [
  ["src/adapters/ai-sdk/provider-model.ts", "createAiSdk7Model", ["generate", "stream"]],
  ["src/adapters/ai-sdk/retrieval.ts", "createAiSdkEmbedder", ["embed", "embed-many"]],
  ["src/adapters/ai-sdk/retrieval.ts", "createAiSdkReranker", ["rerank"]],
  ["src/adapters/ai-sdk/media-image.ts", "fromAiSdkImageModel", ["generate"]],
  ["src/adapters/ai-sdk/media-speech.ts", "fromAiSdkSpeechModel", ["generate"]],
  ["src/adapters/ai-sdk/media-transcription.ts", "fromAiSdkTranscriptionModel", ["transcribe"]],
  ["src/adapters/ai-sdk/storage-cache.ts", "createHostBackedCacheStore", ["get", "set", "delete"]],
  [
    "src/adapters/ai-sdk/storage-conversation.ts",
    "createHostConversationStores",
    ["read", "append", "reset", "load", "save"],
  ],
  [
    "src/adapters/langchain/model-output-parser.ts",
    "fromLangChainOutputParser",
    ["parse", "format-instructions"],
  ],
  ["src/adapters/langchain/retrieval.ts", "createLangChainDocumentLoader", ["load"]],
  [
    "src/adapters/langchain/retrieval.ts",
    "createLangChainTextSplitter",
    ["split", "split-batch", "split-with-metadata"],
  ],
  ["src/adapters/langchain/retrieval.ts", "createLangChainEmbedder", ["embed", "embed-many"]],
  ["src/adapters/langchain/retrieval.ts", "createLangChainRetriever", ["retrieve"]],
  ["src/adapters/langchain/retrieval.ts", "createLangChainReranker", ["rerank"]],
  ["src/adapters/langchain/retrieval.ts", "createLangChainVectorStore", ["upsert", "delete"]],
  ["src/adapters/langchain/retrieval.ts", "createLangChainIndexer", ["index"]],
  [
    "src/adapters/langchain/storage-cache.ts",
    "createLangChainCacheStore",
    ["get", "set", "delete"],
  ],
  [
    "src/adapters/langchain/storage-conversation.ts",
    "createLangChainConversationStateStore",
    ["load", "save"],
  ],
  [
    "src/adapters/langchain/storage-key-value.ts",
    "createLangChainKeyValueStore",
    ["list", "get-many", "set-many", "delete-many"],
  ],
  ["src/adapters/llamaindex/retrieval.ts", "createLlamaIndexDocumentLoader", ["load"]],
  ["src/adapters/llamaindex/retrieval.ts", "createLlamaIndexDocumentTransformer", ["transform"]],
  [
    "src/adapters/llamaindex/retrieval.ts",
    "createLlamaIndexTextSplitter",
    ["split", "split-batch", "split-with-metadata"],
  ],
  ["src/adapters/llamaindex/retrieval.ts", "createLlamaIndexEmbedder", ["embed", "embed-many"]],
  ["src/adapters/llamaindex/retrieval.ts", "createLlamaIndexRetriever", ["retrieve"]],
  ["src/adapters/llamaindex/retrieval.ts", "createLlamaIndexReranker", ["rerank"]],
  ["src/adapters/llamaindex/retrieval.ts", "createLlamaIndexVectorStore", ["upsert", "delete"]],
  ["src/adapters/llamaindex/retrieval.ts", "createLlamaIndexQueryEngine", ["query", "stream"]],
  [
    "src/adapters/llamaindex/retrieval.ts",
    "createLlamaIndexResponseSynthesizer",
    ["synthesize", "stream"],
  ],
  [
    "src/adapters/llamaindex/storage-cache.ts",
    "createLlamaIndexCacheStore",
    ["get", "set", "delete"],
  ],
  [
    "src/adapters/llamaindex/storage-conversation.ts",
    "createLlamaIndexConversationStore",
    ["read", "append", "reset"],
  ],
  [
    "src/adapters/llamaindex/storage-key-value.ts",
    "createLlamaIndexKeyValueStore",
    ["list", "get-many", "set-many", "delete-many"],
  ],
  [
    "src/adapters/llamaindex/storage-key-value.ts",
    "createLlamaIndexDocumentKeyValueStore",
    ["list", "get-many", "set-many", "delete-many"],
  ],
] as const;

const expectedOperationMatrix = expectedImplementationOperations
  .flatMap(([entrypoint, exportName, operations]) =>
    operations.map((operation) => `${entrypoint}#${exportName}#${operation}`),
  )
  .toSorted();

describe("machine-readable adapter catalogue", () => {
  test("is a closed, deterministic inventory of every portable capability adapter", () => {
    const optionalCapabilityIds: Readonly<Record<string, readonly string[]>> = {
      model: ["llm-core.model.stream"],
      "model-output-parser": ["llm-core.model.output.format-instructions"],
      "text-splitter": [
        "llm-core.retrieval.text.split-batch",
        "llm-core.retrieval.text.split-with-metadata",
      ],
      embedder: ["llm-core.retrieval.embedding.generate-many"],
      "query-engine": ["llm-core.retrieval.query.stream"],
      "response-synthesizer": ["llm-core.retrieval.response.stream"],
    };
    expect(ADAPTER_CATALOGUE).toHaveLength(67);
    expect(
      ADAPTER_CATALOGUE.map(
        (entry) =>
          `${entry.implementation.entrypoint}#${entry.implementation.exportName}#${entry.capability.operation}`,
      ).toSorted(),
    ).toEqual(expectedOperationMatrix);
    expect(new Set(ADAPTER_CATALOGUE.map((entry) => entry.adapterId)).size).toBe(
      ADAPTER_CATALOGUE.length,
    );
    expect(ADAPTER_CATALOGUE.map((entry) => entry.adapterId)).toEqual(
      ADAPTER_CATALOGUE.map((entry) => entry.adapterId).toSorted(),
    );
    expect(Object.isFrozen(ADAPTER_CATALOGUE)).toBe(true);
    for (const entry of ADAPTER_CATALOGUE) {
      expect(
        new Set([
          capabilityIdForPort(entry.capability.kind),
          ...(optionalCapabilityIds[entry.capability.kind] ?? []),
        ]).has(entry.capability.capabilityId),
      ).toBe(true);
      expect(entry.support.disposition).toBe("supported");
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.externalAuthority)).toBe(true);
      expect(Object.isFrozen(entry.implementation)).toBe(true);
      expect(Object.isFrozen(entry.capability)).toBe(true);
      expect(Object.isFrozen(entry.support)).toBe(true);
      expect(Object.isFrozen(entry.support.limits)).toBe(true);
      expect(Object.isFrozen(entry.exposure)).toBe(true);
      expect(JSON.stringify(entry)).not.toMatch(/credential|secret|session|factory|client/i);
      expect(entry.implementation.bindingId).toContain(`:${entry.ecosystemId}:`);
      expect(entry.implementation.version).toBe("2.0.0");
    }
  });

  test("attributes external authority and host-only adapters truthfully", () => {
    const authorityFor = (exportName: string) =>
      ADAPTER_CATALOGUE.filter((entry) => entry.implementation.exportName === exportName).map(
        (entry) => ({ ecosystem: entry.ecosystemId, authority: entry.externalAuthority }),
      );

    expect(authorityFor("createAiSdk7Model")).toEqual(
      Array.from({ length: 2 }, () => ({
        ecosystem: "ai-sdk",
        authority: { packageName: "ai", version: "7.0.37" },
      })),
    );
    expect(authorityFor("createHostBackedCacheStore")).toEqual(
      Array.from({ length: 3 }, () => ({
        ecosystem: "host",
        authority: { packageName: "@geekist/llm-core", version: "2.0.0" },
      })),
    );
    expect(authorityFor("createHostConversationStores")).toEqual(
      Array.from({ length: 5 }, () => ({
        ecosystem: "host",
        authority: { packageName: "@geekist/llm-core", version: "2.0.0" },
      })),
    );
  });

  test("records the LlamaIndex vector-store limits operation by operation", () => {
    const rows = ADAPTER_CATALOGUE.filter(
      (entry) => entry.implementation.exportName === "createLlamaIndexVectorStore",
    );
    expect(rows.map((entry) => [entry.capability.operation, entry.support.limits])).toEqual([
      ["delete", ["namespace-unsupported", "filter-delete-unsupported"]],
      ["upsert", ["namespace-unsupported"]],
    ]);
  });

  test("makes public substitution evidence operation-scoped", () => {
    const packed = ADAPTER_CATALOGUE.filter((entry) => entry.support.qualification === "packed");
    expect(
      packed.map((entry) => ({
        ecosystem: entry.ecosystemId,
        kind: entry.capability.kind,
        operation: entry.capability.operation,
        subpath: entry.exposure.packageSubpath,
      })),
    ).toEqual([
      {
        ecosystem: "langchain",
        kind: "retriever",
        operation: "retrieve",
        subpath: "./adapters/langchain",
      },
      {
        ecosystem: "llamaindex",
        kind: "retriever",
        operation: "retrieve",
        subpath: "./adapters/llamaindex",
      },
    ]);
  });
});
