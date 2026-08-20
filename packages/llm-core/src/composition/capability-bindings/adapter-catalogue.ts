/* eslint-disable max-params -- Catalogue rows keep the external identity, implementation, capability and evidence tuple explicit. */
import type { CapabilityPortKind } from "../../application/capability-bindings/public";

export type AdapterCatalogueQualification = "focused" | "packed";
export type AdapterCatalogueExposure = "internal" | "public";

export interface AdapterCatalogueEntry {
  readonly adapterId: string;
  readonly ecosystemId: "ai-sdk" | "host" | "langchain" | "llamaindex";
  readonly externalAuthority: {
    readonly packageName: string;
    readonly version: string;
  };
  readonly implementation: {
    readonly entrypoint: string;
    readonly exportName: string;
    readonly bindingId: string;
    readonly version: string;
  };
  readonly capability: {
    readonly kind: CapabilityPortKind;
    readonly capabilityId: string;
    readonly operation: string;
  };
  readonly support: {
    readonly disposition: "supported";
    readonly qualification: AdapterCatalogueQualification;
    readonly evidenceSuite: string;
    readonly limits: readonly string[];
  };
  readonly exposure: {
    readonly status: AdapterCatalogueExposure;
    readonly packageSubpath?: string;
  };
}

type EntrySource = Omit<AdapterCatalogueEntry, "adapterId">;
type ImplementationSource = Pick<
  AdapterCatalogueEntry["implementation"],
  "entrypoint" | "exportName"
>;

const entry = (source: EntrySource): AdapterCatalogueEntry =>
  Object.freeze({
    adapterId: `${source.ecosystemId}:${source.implementation.entrypoint}:${source.implementation.exportName}:${source.capability.kind}:${source.capability.operation}`,
    ecosystemId: source.ecosystemId,
    externalAuthority: Object.freeze(source.externalAuthority),
    implementation: Object.freeze(source.implementation),
    capability: Object.freeze(source.capability),
    support: Object.freeze({ ...source.support, limits: Object.freeze(source.support.limits) }),
    exposure: Object.freeze(source.exposure),
  });

const operation = (
  ecosystemId: AdapterCatalogueEntry["ecosystemId"],
  authority: AdapterCatalogueEntry["externalAuthority"],
  implementation: ImplementationSource,
  capability: AdapterCatalogueEntry["capability"],
  evidenceSuite: string,
  exposure: AdapterCatalogueEntry["exposure"] = { status: "internal" },
  qualification: AdapterCatalogueQualification = "focused",
  limits: readonly string[] = [],
): AdapterCatalogueEntry =>
  entry({
    ecosystemId,
    externalAuthority: authority,
    implementation: {
      ...implementation,
      bindingId: `llm-core:${ecosystemId}:${capability.kind}:${implementation.exportName}`,
      version: "2.0.0",
    },
    capability,
    support: { disposition: "supported", qualification, evidenceSuite, limits },
    exposure,
  });

const aiSdk = { packageName: "ai", version: "7.0.37" } as const;
const host = { packageName: "@geekist/llm-core", version: "2.0.0" } as const;
const langChain = { packageName: "@langchain/core", version: "1.1.8" } as const;
const langChainTextSplitters = {
  packageName: "@langchain/textsplitters",
  version: "1.0.1",
} as const;
const llamaIndex = { packageName: "@llamaindex/core", version: "0.6.22" } as const;
const aiSdkExposure = { status: "public", packageSubpath: "./adapters/ai-sdk" } as const;
const langChainExposure = { status: "public", packageSubpath: "./adapters/langchain" } as const;
const llamaIndexExposure = { status: "public", packageSubpath: "./adapters/llamaindex" } as const;

interface PortOperationSource {
  readonly ecosystemId: AdapterCatalogueEntry["ecosystemId"];
  readonly authority: AdapterCatalogueEntry["externalAuthority"];
  readonly implementation: ImplementationSource;
  readonly kind: CapabilityPortKind;
  readonly operations: readonly (readonly [capabilityId: string, operation: string])[];
  readonly evidenceSuite: string;
  readonly exposure?: AdapterCatalogueEntry["exposure"];
  readonly qualification?: AdapterCatalogueQualification;
  readonly limits?: readonly string[];
}

const portOperations = (source: PortOperationSource): readonly AdapterCatalogueEntry[] =>
  source.operations.map(([capabilityId, operationId]) =>
    operation(
      source.ecosystemId,
      source.authority,
      source.implementation,
      { kind: source.kind, capabilityId, operation: operationId },
      source.evidenceSuite,
      source.exposure,
      source.qualification,
      source.limits,
    ),
  );

const aiSdkOperations = [
  ...portOperations({
    ecosystemId: "ai-sdk",
    authority: aiSdk,
    implementation: {
      entrypoint: "src/adapters/ai-sdk/provider-model.ts",
      exportName: "createAiSdk7Model",
    },
    kind: "model",
    operations: [
      ["llm-core.model.generate", "generate"],
      ["llm-core.model.stream", "stream"],
    ],
    evidenceSuite: "llm-core.adapter.ai-sdk.model",
    exposure: aiSdkExposure,
  }),
  ...portOperations({
    ecosystemId: "ai-sdk",
    authority: aiSdk,
    implementation: {
      entrypoint: "src/adapters/ai-sdk/retrieval.ts",
      exportName: "createAiSdkEmbedder",
    },
    kind: "embedder",
    operations: [
      ["llm-core.retrieval.embedding.generate", "embed"],
      ["llm-core.retrieval.embedding.generate-many", "embed-many"],
    ],
    evidenceSuite: "llm-core.adapter.retrieval.parity",
    exposure: aiSdkExposure,
  }),
  ...portOperations({
    ecosystemId: "ai-sdk",
    authority: aiSdk,
    implementation: {
      entrypoint: "src/adapters/ai-sdk/retrieval.ts",
      exportName: "createAiSdkReranker",
    },
    kind: "reranker",
    operations: [["llm-core.retrieval.rerank", "rerank"]],
    evidenceSuite: "llm-core.adapter.retrieval.parity",
    exposure: aiSdkExposure,
  }),
  ...[
    [
      "image-generation",
      "llm-core.media.image.generate",
      "generate",
      "media-image",
      "fromAiSdkImageModel",
    ],
    [
      "speech-generation",
      "llm-core.media.speech.generate",
      "generate",
      "media-speech",
      "fromAiSdkSpeechModel",
    ],
    [
      "transcription",
      "llm-core.media.transcribe",
      "transcribe",
      "media-transcription",
      "fromAiSdkTranscriptionModel",
    ],
  ].flatMap(([kind, capabilityId, operationId, file, exportName]) =>
    portOperations({
      ecosystemId: "ai-sdk",
      authority: aiSdk,
      implementation: { entrypoint: `src/adapters/ai-sdk/${file}.ts`, exportName: exportName! },
      kind: kind as CapabilityPortKind,
      operations: [[capabilityId!, operationId!]],
      evidenceSuite: "llm-core.adapter.ai-sdk.media",
      exposure: aiSdkExposure,
    }),
  ),
  ...portOperations({
    ecosystemId: "host",
    authority: host,
    implementation: {
      entrypoint: "src/adapters/ai-sdk/storage-cache.ts",
      exportName: "createHostBackedCacheStore",
    },
    kind: "cache-store",
    operations: ["get", "set", "delete"].map((operationId) => [
      "llm-core.storage.cache",
      operationId,
    ]),
    evidenceSuite: "llm-core.adapter.host.storage.qualified",
  }),
  ...portOperations({
    ecosystemId: "host",
    authority: host,
    implementation: {
      entrypoint: "src/adapters/ai-sdk/storage-conversation.ts",
      exportName: "createHostConversationStores",
    },
    kind: "conversation-store",
    operations: ["read", "append", "reset"].map((operationId) => [
      "llm-core.memory.conversation",
      operationId,
    ]),
    evidenceSuite: "llm-core.adapter.host.memory.qualified",
  }),
  ...portOperations({
    ecosystemId: "host",
    authority: host,
    implementation: {
      entrypoint: "src/adapters/ai-sdk/storage-conversation.ts",
      exportName: "createHostConversationStores",
    },
    kind: "conversation-state-store",
    operations: ["load", "save"].map((operationId) => [
      "llm-core.memory.conversation-state",
      operationId,
    ]),
    evidenceSuite: "llm-core.adapter.host.memory.qualified",
  }),
];

const langChainOperations = [
  [
    "model-output-parser",
    "llm-core.model.output.parse",
    "parse",
    "fromLangChainOutputParser",
    "model-output-parser",
  ],
  [
    "model-output-parser",
    "llm-core.model.output.format-instructions",
    "format-instructions",
    "fromLangChainOutputParser",
    "model-output-parser",
  ],
  [
    "document-loader",
    "llm-core.retrieval.document.load",
    "load",
    "createLangChainDocumentLoader",
    "retrieval",
  ],
  [
    "text-splitter",
    "llm-core.retrieval.text.split",
    "split",
    "createLangChainTextSplitter",
    "retrieval",
  ],
  [
    "text-splitter",
    "llm-core.retrieval.text.split-batch",
    "split-batch",
    "createLangChainTextSplitter",
    "retrieval",
  ],
  [
    "text-splitter",
    "llm-core.retrieval.text.split-with-metadata",
    "split-with-metadata",
    "createLangChainTextSplitter",
    "retrieval",
  ],
  [
    "embedder",
    "llm-core.retrieval.embedding.generate",
    "embed",
    "createLangChainEmbedder",
    "retrieval",
  ],
  [
    "embedder",
    "llm-core.retrieval.embedding.generate-many",
    "embed-many",
    "createLangChainEmbedder",
    "retrieval",
  ],
  ["retriever", "llm-core.retrieval.retrieve", "retrieve", "createLangChainRetriever", "retrieval"],
  ["reranker", "llm-core.retrieval.rerank", "rerank", "createLangChainReranker", "retrieval"],
  [
    "vector-store",
    "llm-core.indexing.vector-store",
    "upsert",
    "createLangChainVectorStore",
    "retrieval",
  ],
  [
    "vector-store",
    "llm-core.indexing.vector-store",
    "delete",
    "createLangChainVectorStore",
    "retrieval",
  ],
  ["indexer", "llm-core.indexing.index", "index", "createLangChainIndexer", "retrieval"],
  ...["get", "set", "delete"].map((operationId) => [
    "cache-store",
    "llm-core.storage.cache",
    operationId,
    "createLangChainCacheStore",
    "storage-cache",
  ]),
  ...["load", "save"].map((operationId) => [
    "conversation-state-store",
    "llm-core.memory.conversation-state",
    operationId,
    "createLangChainConversationStateStore",
    "storage-conversation",
  ]),
  ...["list", "get-many", "set-many", "delete-many"].map((operationId) => [
    "key-value-store",
    "llm-core.storage.key-value",
    operationId,
    "createLangChainKeyValueStore",
    "storage-key-value",
  ]),
].flatMap(([kind, capabilityId, operationId, exportName, file]) =>
  portOperations({
    ecosystemId: "langchain",
    authority: kind === "text-splitter" ? langChainTextSplitters : langChain,
    implementation: { entrypoint: `src/adapters/langchain/${file}.ts`, exportName: exportName! },
    kind: kind as CapabilityPortKind,
    operations: [[capabilityId!, operationId!]],
    evidenceSuite:
      kind === "retriever"
        ? "llm-core.adapter.retrieval.packed-substitution"
        : "llm-core.adapter.langchain.focused",
    exposure: kind === "retriever" ? langChainExposure : undefined,
    qualification: kind === "retriever" ? "packed" : "focused",
  }),
);

const llamaIndexOperations = [
  [
    "document-loader",
    "llm-core.retrieval.document.load",
    "load",
    "createLlamaIndexDocumentLoader",
    "retrieval",
  ],
  [
    "document-transformer",
    "llm-core.retrieval.document.transform",
    "transform",
    "createLlamaIndexDocumentTransformer",
    "retrieval",
  ],
  [
    "text-splitter",
    "llm-core.retrieval.text.split",
    "split",
    "createLlamaIndexTextSplitter",
    "retrieval",
  ],
  [
    "text-splitter",
    "llm-core.retrieval.text.split-batch",
    "split-batch",
    "createLlamaIndexTextSplitter",
    "retrieval",
  ],
  [
    "text-splitter",
    "llm-core.retrieval.text.split-with-metadata",
    "split-with-metadata",
    "createLlamaIndexTextSplitter",
    "retrieval",
  ],
  [
    "embedder",
    "llm-core.retrieval.embedding.generate",
    "embed",
    "createLlamaIndexEmbedder",
    "retrieval",
  ],
  [
    "embedder",
    "llm-core.retrieval.embedding.generate-many",
    "embed-many",
    "createLlamaIndexEmbedder",
    "retrieval",
  ],
  [
    "retriever",
    "llm-core.retrieval.retrieve",
    "retrieve",
    "createLlamaIndexRetriever",
    "retrieval",
  ],
  ["reranker", "llm-core.retrieval.rerank", "rerank", "createLlamaIndexReranker", "retrieval"],
  [
    "vector-store",
    "llm-core.indexing.vector-store",
    "upsert",
    "createLlamaIndexVectorStore",
    "retrieval",
    ["namespace-unsupported"],
  ],
  [
    "vector-store",
    "llm-core.indexing.vector-store",
    "delete",
    "createLlamaIndexVectorStore",
    "retrieval",
    ["namespace-unsupported", "filter-delete-unsupported"],
  ],
  ["query-engine", "llm-core.retrieval.query", "query", "createLlamaIndexQueryEngine", "retrieval"],
  [
    "query-engine",
    "llm-core.retrieval.query.stream",
    "stream",
    "createLlamaIndexQueryEngine",
    "retrieval",
  ],
  [
    "response-synthesizer",
    "llm-core.retrieval.response.synthesize",
    "synthesize",
    "createLlamaIndexResponseSynthesizer",
    "retrieval",
  ],
  [
    "response-synthesizer",
    "llm-core.retrieval.response.stream",
    "stream",
    "createLlamaIndexResponseSynthesizer",
    "retrieval",
  ],
  ...["get", "set", "delete"].map((operationId) => [
    "cache-store",
    "llm-core.storage.cache",
    operationId,
    "createLlamaIndexCacheStore",
    "storage-cache",
  ]),
  ...["read", "append", "reset"].map((operationId) => [
    "conversation-store",
    "llm-core.memory.conversation",
    operationId,
    "createLlamaIndexConversationStore",
    "storage-conversation",
  ]),
  ...["list", "get-many", "set-many", "delete-many"].map((operationId) => [
    "key-value-store",
    "llm-core.storage.key-value",
    operationId,
    "createLlamaIndexKeyValueStore",
    "storage-key-value",
  ]),
  ...["list", "get-many", "set-many", "delete-many"].map((operationId) => [
    "key-value-store",
    "llm-core.storage.key-value",
    operationId,
    "createLlamaIndexDocumentKeyValueStore",
    "storage-key-value",
  ]),
].flatMap(([kind, capabilityId, operationId, exportName, file, limits]) =>
  portOperations({
    ecosystemId: "llamaindex",
    authority: llamaIndex,
    implementation: {
      entrypoint: `src/adapters/llamaindex/${file as string}.ts`,
      exportName: exportName as string,
    },
    kind: kind as CapabilityPortKind,
    operations: [[capabilityId as string, operationId as string]],
    evidenceSuite:
      kind === "retriever"
        ? "llm-core.adapter.retrieval.packed-substitution"
        : "llm-core.adapter.llamaindex.focused",
    exposure: kind === "retriever" ? llamaIndexExposure : undefined,
    qualification: kind === "retriever" ? "packed" : "focused",
    limits: limits as readonly string[] | undefined,
  }),
);

/**
 * Machine-readable inventory of implemented adapters that satisfy portable
 * capability ports. UI projections, protocols and specification mappings are
 * intentionally excluded because they are not selectable CapabilityPortMap implementations.
 */
export const ADAPTER_CATALOGUE: readonly AdapterCatalogueEntry[] = Object.freeze(
  [...aiSdkOperations, ...langChainOperations, ...llamaIndexOperations].toSorted((left, right) =>
    left.adapterId.localeCompare(right.adapterId),
  ),
);
