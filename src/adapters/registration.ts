import type {
  AdapterBundle,
  Cache,
  Model,
  ImageModel,
  Memory,
  Retriever,
  SpeechModel,
  Tool,
  AdapterTraceSink,
  TranscriptionModel,
  VectorStore,
} from "./types";

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
  "prompts",
  "schemas",
  "textSplitter",
  "embedder",
  "retriever",
  "reranker",
  "loader",
  "transformer",
  "memory",
  "speech",
  "storage",
  "transcription",
  "kv",
  "vectorStore",
  "constructs",
]);

const isBundleKey = (construct: string): construct is keyof AdapterBundle =>
  bundleKeys.has(construct as keyof AdapterBundle) && construct !== "constructs";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const buildBundle = (construct: string, value: unknown): AdapterBundle => {
  if (isBundleKey(construct)) {
    return { [construct]: value } as AdapterBundle;
  }
  if (construct === "constructs") {
    // Allow a direct constructs map; non-objects are wrapped for convenience.
    return { constructs: isObject(value) ? value : { value } };
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
  retriever(key: string, retriever: Retriever, options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, { retriever }, options);
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
