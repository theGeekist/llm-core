import type {
  AdapterBundle,
  Cache,
  CheckpointStore,
  EventStream,
  ImageModel,
  Indexing,
  InterruptStrategy,
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

type RegisterInput = {
  key: string;
  construct: string;
  value: unknown;
  options?: AdapterPluginOptions;
};

type RegisterArgs =
  | [key: string, construct: string, value: unknown, options?: AdapterPluginOptions]
  | [input: RegisterInput];

const readRegisterInput = (args: RegisterArgs): RegisterInput => {
  const first = args[0];
  if (args.length === 1 && isRecord(first)) {
    const input = first as RegisterInput;
    return {
      key: input.key,
      construct: input.construct,
      value: input.value,
      options: input.options,
    };
  }
  return {
    key: args[0] as string,
    construct: args[1] as string,
    value: args[2],
    options: args[3] as AdapterPluginOptions | undefined,
  };
};

const bundleKeys = new Set<keyof AdapterBundle>([
  "cache",
  "checkpoint",
  "documents",
  "eventStream",
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
  "interrupt",
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
  register(...args: RegisterArgs): AdapterPlugin {
    const input = readRegisterInput(args);
    return makePlugin(input.key, buildBundle(input.construct, input.value), input.options);
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
  checkpoint(
    key: string,
    checkpoint: CheckpointStore,
    options?: AdapterPluginOptions,
  ): AdapterPlugin {
    return makePlugin(key, { checkpoint }, options);
  },
  trace(key: string, trace: EventStream, options?: AdapterPluginOptions): AdapterPlugin {
    return makePlugin(key, { trace }, options);
  },
  eventStream(
    key: string,
    eventStream: EventStream,
    options?: AdapterPluginOptions,
  ): AdapterPlugin {
    return makePlugin(key, { eventStream }, options);
  },
  interrupt(
    key: string,
    interrupt: InterruptStrategy,
    options?: AdapterPluginOptions,
  ): AdapterPlugin {
    return makePlugin(key, { interrupt }, options);
  },
};
