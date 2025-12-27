import type {
  AdapterBundle,
  AdapterTraceSink,
  Cache,
  ImageModel,
  Indexing,
  Memory,
  Model,
  OutputParser,
  QueryEngine,
  ResponseSynthesizer,
  Retriever,
  SpeechModel,
  Tool,
  TranscriptionModel,
  VectorStore,
} from "./types";
import { isRecord } from "./utils";

export type AdapterPlugin = {
  key: string;
  adapters: AdapterBundle;
  capabilities?: Record<string, unknown>;
  mode?: "extend" | "override";
  overrideKey?: string;
};

export type AdapterPluginOptions = {
  capabilities?: Record<string, unknown>;
  mode?: "extend" | "override";
  overrideKey?: string;
};

const bundleKeys = new Set<keyof AdapterBundle>([
  "documents",
  "messages",
  "tools",
  "model",
  "image",
  "trace",
  "indexing",
  "prompts",
  "outputParser",
  "schemas",
  "textSplitter",
  "embedder",
  "retriever",
  "reranker",
  "loader",
  "transformer",
  "memory",
  "queryEngine",
  "responseSynthesizer",
  "speech",
  "storage",
  "transcription",
  "kv",
  "vectorStore",
  "constructs",
]);

const isBundleKey = (construct: string): construct is keyof AdapterBundle =>
  bundleKeys.has(construct as keyof AdapterBundle) && construct !== "constructs";

const buildBundle = (construct: string, value: unknown): AdapterBundle => {
  if (isBundleKey(construct)) {
    return { [construct]: value } as AdapterBundle;
  }
  if (construct === "constructs") {
    // Allow a direct constructs map; non-objects are wrapped for convenience.
    return { constructs: isRecord(value) ? value : { value } };
  }
  return { constructs: { [construct]: value } };
};

const makePlugin = (
  key: string,
  adapters: AdapterBundle,
  options?: AdapterPluginOptions,
): AdapterPlugin => ({
  key,
  adapters,
  capabilities: options?.capabilities,
  mode: options?.mode,
  overrideKey: options?.overrideKey,
});

export const Adapter = {
  plugin(key: string, adapters: AdapterBundle, options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, adapters, options);
  },
  register(
    key: string,
    construct: string,
    value: unknown,
    options?: AdapterPluginOptions,
  ): AdapterPlugin {
    return makePlugin(key, buildBundle(construct, value), options);
  },
  model(key: string, model: Model, options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, { model }, options);
  },
  image(key: string, image: ImageModel, options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, { image }, options);
  },
  tools(key: string, tools: Tool[], options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, { tools }, options);
  },
  outputParser(
    key: string,
    outputParser: OutputParser,
    options?: AdapterPluginOptions,
  ): AdapterPlugin {
    return makePlugin(key, { outputParser }, options);
  },
  indexing(key: string, indexing: Indexing, options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, { indexing }, options);
  },
  retriever(key: string, retriever: Retriever, options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, { retriever }, options);
  },
  queryEngine(
    key: string,
    queryEngine: QueryEngine,
    options?: AdapterPluginOptions,
  ): AdapterPlugin {
    return makePlugin(key, { queryEngine }, options);
  },
  responseSynthesizer(
    key: string,
    responseSynthesizer: ResponseSynthesizer,
    options?: AdapterPluginOptions,
  ): AdapterPlugin {
    return makePlugin(key, { responseSynthesizer }, options);
  },
  memory(key: string, memory: Memory, options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, { memory }, options);
  },
  speech(key: string, speech: SpeechModel, options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, { speech }, options);
  },
  transcription(
    key: string,
    transcription: TranscriptionModel,
    options?: AdapterPluginOptions,
  ): AdapterPlugin {
    return makePlugin(key, { transcription }, options);
  },
  vectorStore(
    key: string,
    vectorStore: VectorStore,
    options?: AdapterPluginOptions,
  ): AdapterPlugin {
    return makePlugin(key, { vectorStore }, options);
  },
  cache(key: string, cache: Cache, options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, { cache }, options);
  },
  trace(key: string, trace: AdapterTraceSink, options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, { trace }, options);
  },
};
