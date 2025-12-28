import type {
  AdapterBundle,
  AdapterCallContext,
  RetryConfig,
  RetryMetadata,
  RetryPolicy,
} from "../adapters/types";
import type { MaybePromise } from "../maybe";
import { bindFirst } from "../maybe";
import type { TraceEvent } from "./trace";
import {
  type RetryWrapperInput,
  type RetryAdapterKind,
  mergeRetryConfig,
  selectRetryConfig,
  wrapRetryCallOne,
  wrapRetryCallZero,
  wrapRetryCallThree,
  wrapRetryCallTwo,
} from "./runtime/retry";
import { createAdapterDiagnostic, type DiagnosticEntry } from "./diagnostics";

const createContextState = () => {
  const diagnostics: DiagnosticEntry[] = [];
  const context: AdapterCallContext = {
    report: (diagnostic) => {
      diagnostics.push(createAdapterDiagnostic(diagnostic));
    },
  };
  return { context, diagnostics };
};

type AdapterContextOptions = {
  retry?: RetryConfig;
  retryDefaults?: RetryConfig;
  trace?: TraceEvent[];
};

type RetryWrapContext = {
  context: AdapterCallContext;
  retry?: RetryConfig;
  retryDefaults?: RetryConfig;
  trace?: TraceEvent[];
};

type AdapterFnOne<TInput, TResult> = (
  input: TInput,
  context?: AdapterCallContext,
) => MaybePromise<TResult>;

type AdapterFnZero<TResult> = (context?: AdapterCallContext) => MaybePromise<TResult>;

type AdapterFnTwo<TFirst, TSecond, TResult> = (
  first: TFirst,
  second: TSecond,
  context?: AdapterCallContext,
) => MaybePromise<TResult>;

type AdapterFnThree<TFirst, TSecond, TThird, TResult> = (
  first: TFirst,
  second: TSecond,
  third: TThird,
  context?: AdapterCallContext,
) => MaybePromise<TResult>;

const createRetryWrapContext = (
  context: AdapterCallContext,
  options?: AdapterContextOptions,
): RetryWrapContext => ({
  context,
  retry: mergeRetryConfig(options?.retryDefaults, options?.retry),
  retryDefaults: options?.retryDefaults,
  trace: options?.trace,
});

const readRetryPolicy = (retry: RetryConfig | undefined, kind: RetryAdapterKind) =>
  selectRetryConfig(retry, kind);

const buildRetryWrapperInput = <TArgs extends unknown[], TResult>(
  input: RetryWrapContext,
  adapterKind: RetryAdapterKind,
  method: string,
  call: (...args: [...TArgs, AdapterCallContext?]) => MaybePromise<TResult>,
  metadata?: RetryMetadata,
): RetryWrapperInput<TArgs, TResult> => ({
  adapterKind,
  method,
  call,
  policy: readRetryPolicy(input.retry, adapterKind),
  metadata,
  trace: input.trace,
  context: input.context,
});

const wrapRequiredOne = <TInput, TResult>(
  input: RetryWrapContext,
  adapterKind: RetryAdapterKind,
  method: string,
  fn: AdapterFnOne<TInput, TResult>,
  metadata?: RetryMetadata,
) =>
  bindFirst(
    wrapRetryCallOne<TInput, TResult>,
    buildRetryWrapperInput<[TInput], TResult>(input, adapterKind, method, fn, metadata),
  );

const wrapOptionalOne = <TInput, TResult>(
  input: RetryWrapContext,
  adapterKind: RetryAdapterKind,
  method: string,
  fn: AdapterFnOne<TInput, TResult> | undefined,
  metadata?: RetryMetadata,
) =>
  fn
    ? bindFirst(
        wrapRetryCallOne<TInput, TResult>,
        buildRetryWrapperInput<[TInput], TResult>(input, adapterKind, method, fn, metadata),
      )
    : undefined;

const wrapRequiredZero = <TResult>(
  input: RetryWrapContext,
  adapterKind: RetryAdapterKind,
  method: string,
  fn: AdapterFnZero<TResult>,
  metadata?: RetryMetadata,
) =>
  bindFirst(
    wrapRetryCallZero<TResult>,
    buildRetryWrapperInput<[], TResult>(input, adapterKind, method, fn, metadata),
  );

const wrapRequiredTwo = <TFirst, TSecond, TResult>(
  input: RetryWrapContext,
  adapterKind: RetryAdapterKind,
  method: string,
  fn: AdapterFnTwo<TFirst, TSecond, TResult>,
  metadata?: RetryMetadata,
) =>
  bindFirst(
    wrapRetryCallTwo<TFirst, TSecond, TResult>,
    buildRetryWrapperInput<[TFirst, TSecond], TResult>(input, adapterKind, method, fn, metadata),
  );

const wrapRequiredThree = <TFirst, TSecond, TThird, TResult>(
  input: RetryWrapContext,
  adapterKind: RetryAdapterKind,
  method: string,
  fn: AdapterFnThree<TFirst, TSecond, TThird, TResult>,
  metadata?: RetryMetadata,
) =>
  bindFirst(
    wrapRetryCallThree<TFirst, TSecond, TThird, TResult>,
    buildRetryWrapperInput<[TFirst, TSecond, TThird], TResult>(
      input,
      adapterKind,
      method,
      fn,
      metadata,
    ),
  );

const wrapOptionalTwo = <TFirst, TSecond, TResult>(
  input: RetryWrapContext,
  adapterKind: RetryAdapterKind,
  method: string,
  fn: AdapterFnTwo<TFirst, TSecond, TResult> | undefined,
  metadata?: RetryMetadata,
) =>
  fn
    ? bindFirst(
        wrapRetryCallTwo<TFirst, TSecond, TResult>,
        buildRetryWrapperInput<[TFirst, TSecond], TResult>(
          input,
          adapterKind,
          method,
          fn,
          metadata,
        ),
      )
    : undefined;

const wrapOptionalThree = <TFirst, TSecond, TThird, TResult>(
  input: RetryWrapContext,
  adapterKind: RetryAdapterKind,
  method: string,
  fn: AdapterFnThree<TFirst, TSecond, TThird, TResult> | undefined,
  metadata?: RetryMetadata,
) =>
  fn
    ? bindFirst(
        wrapRetryCallThree<TFirst, TSecond, TThird, TResult>,
        buildRetryWrapperInput<[TFirst, TSecond, TThird], TResult>(
          input,
          adapterKind,
          method,
          fn,
          metadata,
        ),
      )
    : undefined;

const canRetryStream = (policy?: RetryPolicy, metadata?: RetryMetadata) =>
  !!policy && metadata?.restartable === true;

const wrapRetryStream = <TInput, TResult>(
  input: RetryWrapContext,
  adapterKind: RetryAdapterKind,
  method: string,
  stream: AdapterFnOne<TInput, TResult> | undefined,
  metadata: RetryMetadata | undefined,
  policy: RetryPolicy | undefined,
) =>
  stream && canRetryStream(policy, metadata)
    ? wrapRequiredOne(input, adapterKind, method, stream, metadata)
    : stream;

const wrapEmbedder = (embedder: AdapterBundle["embedder"], input: RetryWrapContext) => {
  if (!embedder) {
    return undefined;
  }
  const metadata = embedder.metadata?.retry;
  return {
    ...embedder,
    embed: wrapRequiredOne(input, "embedder", "embed", embedder.embed, metadata),
    embedMany: wrapOptionalOne(input, "embedder", "embedMany", embedder.embedMany, metadata),
  };
};

const wrapImage = (image: AdapterBundle["image"], input: RetryWrapContext) => {
  if (!image) {
    return undefined;
  }
  const metadata = image.metadata?.retry;
  return {
    ...image,
    generate: wrapRequiredOne(input, "image", "generate", image.generate, metadata),
  };
};

const wrapRetriever = (retriever: AdapterBundle["retriever"], input: RetryWrapContext) => {
  if (!retriever) {
    return undefined;
  }
  const metadata = retriever.metadata?.retry;
  return {
    ...retriever,
    retrieve: wrapRequiredOne(input, "retriever", "retrieve", retriever.retrieve, metadata),
  };
};

const wrapReranker = (reranker: AdapterBundle["reranker"], input: RetryWrapContext) => {
  if (!reranker) {
    return undefined;
  }
  const metadata = reranker.metadata?.retry;
  return {
    ...reranker,
    rerank: wrapRequiredTwo(input, "reranker", "rerank", reranker.rerank, metadata),
  };
};

const wrapTextSplitter = (splitter: AdapterBundle["textSplitter"], input: RetryWrapContext) => {
  if (!splitter) {
    return undefined;
  }
  const metadata = splitter.metadata?.retry;
  return {
    ...splitter,
    split: wrapRequiredOne(input, "textSplitter", "split", splitter.split, metadata),
    splitBatch: wrapOptionalOne(input, "textSplitter", "splitBatch", splitter.splitBatch, metadata),
    splitWithMetadata: wrapOptionalOne(
      input,
      "textSplitter",
      "splitWithMetadata",
      splitter.splitWithMetadata,
      metadata,
    ),
  };
};

const wrapOutputParser = (outputParser: AdapterBundle["outputParser"], input: RetryWrapContext) => {
  if (!outputParser) {
    return undefined;
  }
  const metadata = outputParser.metadata?.retry;
  return {
    ...outputParser,
    parse: wrapRequiredOne(input, "outputParser", "parse", outputParser.parse, metadata),
    formatInstructions: outputParser.formatInstructions,
  };
};

const wrapModel = (model: AdapterBundle["model"], input: RetryWrapContext) => {
  if (!model) {
    return undefined;
  }
  const metadata = model.metadata?.retry;
  const policy = readRetryPolicy(input.retry, "model");
  const wrappedStream = wrapRetryStream(input, "model", "stream", model.stream, metadata, policy);
  return {
    ...model,
    generate: wrapRequiredOne(input, "model", "generate", model.generate, metadata),
    stream: wrappedStream,
  };
};

const wrapLoader = (loader: AdapterBundle["loader"], input: RetryWrapContext) => {
  if (!loader) {
    return undefined;
  }
  const metadata = loader.metadata?.retry;
  return {
    ...loader,
    load: wrapRequiredZero(input, "loader", "load", loader.load, metadata),
  };
};

const wrapTransformer = (transformer: AdapterBundle["transformer"], input: RetryWrapContext) => {
  if (!transformer) {
    return undefined;
  }
  const metadata = transformer.metadata?.retry;
  return {
    ...transformer,
    transform: wrapRequiredOne(input, "transformer", "transform", transformer.transform, metadata),
  };
};

const wrapStorage = (storage: AdapterBundle["storage"], input: RetryWrapContext) => {
  if (!storage) {
    return undefined;
  }
  return {
    ...storage,
    get: wrapRequiredOne(input, "storage", "get", storage.get),
    put: wrapRequiredTwo(input, "storage", "put", storage.put),
    delete: wrapRequiredOne(input, "storage", "delete", storage.delete),
    list: wrapRequiredOne(input, "storage", "list", storage.list),
  };
};

const wrapCache = (cache: AdapterBundle["cache"], input: RetryWrapContext) => {
  if (!cache) {
    return undefined;
  }
  return {
    ...cache,
    get: wrapRequiredOne(input, "cache", "get", cache.get),
    set: wrapRequiredThree(input, "cache", "set", cache.set),
    delete: wrapRequiredOne(input, "cache", "delete", cache.delete),
  };
};

const wrapKv = (kv: AdapterBundle["kv"], input: RetryWrapContext) => {
  if (!kv) {
    return undefined;
  }
  return {
    ...kv,
    mget: wrapRequiredOne(input, "kv", "mget", kv.mget),
    mset: wrapRequiredOne(input, "kv", "mset", kv.mset),
    mdelete: wrapRequiredOne(input, "kv", "mdelete", kv.mdelete),
    list: wrapRequiredOne(input, "kv", "list", kv.list),
  };
};

const wrapMemory = (memory: AdapterBundle["memory"], input: RetryWrapContext) => {
  if (!memory) {
    return undefined;
  }
  const metadata = memory.metadata?.retry;
  return {
    ...memory,
    append: wrapOptionalTwo(input, "memory", "append", memory.append, metadata),
    read: wrapOptionalOne(input, "memory", "read", memory.read, metadata),
    summarize: wrapOptionalOne(input, "memory", "summarize", memory.summarize, metadata),
    load: wrapOptionalOne(input, "memory", "load", memory.load, metadata),
    save: wrapOptionalThree(input, "memory", "save", memory.save, metadata),
    reset: wrapOptionalOne(input, "memory", "reset", memory.reset, metadata),
  };
};

const wrapSpeech = (speech: AdapterBundle["speech"], input: RetryWrapContext) => {
  if (!speech) {
    return undefined;
  }
  const metadata = speech.metadata?.retry;
  return {
    ...speech,
    generate: wrapRequiredOne(input, "speech", "generate", speech.generate, metadata),
  };
};

const wrapTranscription = (
  transcription: AdapterBundle["transcription"],
  input: RetryWrapContext,
) => {
  if (!transcription) {
    return undefined;
  }
  const metadata = transcription.metadata?.retry;
  return {
    ...transcription,
    generate: wrapRequiredOne(input, "transcription", "generate", transcription.generate, metadata),
  };
};

const wrapVectorStore = (store: AdapterBundle["vectorStore"], input: RetryWrapContext) => {
  if (!store) {
    return undefined;
  }
  const metadata = store.metadata?.retry;
  return {
    ...store,
    upsert: wrapRequiredOne(input, "vectorStore", "upsert", store.upsert, metadata),
    delete: wrapRequiredOne(input, "vectorStore", "delete", store.delete, metadata),
  };
};

const wrapQueryEngine = (engine: AdapterBundle["queryEngine"], input: RetryWrapContext) => {
  if (!engine) {
    return undefined;
  }
  const metadata = engine.metadata?.retry;
  const policy = readRetryPolicy(input.retry, "queryEngine");
  const wrappedStream = wrapRetryStream(
    input,
    "queryEngine",
    "stream",
    engine.stream,
    metadata,
    policy,
  );
  return {
    ...engine,
    query: wrapRequiredOne(input, "queryEngine", "query", engine.query, metadata),
    stream: wrappedStream,
  };
};

const wrapResponseSynthesizer = (
  synthesizer: AdapterBundle["responseSynthesizer"],
  input: RetryWrapContext,
) => {
  if (!synthesizer) {
    return undefined;
  }
  const metadata = synthesizer.metadata?.retry;
  const policy = readRetryPolicy(input.retry, "responseSynthesizer");
  const wrappedStream = wrapRetryStream(
    input,
    "responseSynthesizer",
    "stream",
    synthesizer.stream,
    metadata,
    policy,
  );
  return {
    ...synthesizer,
    synthesize: wrapRequiredOne(
      input,
      "responseSynthesizer",
      "synthesize",
      synthesizer.synthesize,
      metadata,
    ),
    stream: wrappedStream,
  };
};

const wrapTools = (tools: AdapterBundle["tools"], input: RetryWrapContext) => {
  if (!tools) {
    return undefined;
  }
  return tools.map((tool) => ({
    ...tool,
    execute: tool.execute
      ? bindFirst(
          wrapRetryCallOne,
          buildRetryWrapperInput(input, "tools", "execute", tool.execute, tool.metadata?.retry),
        )
      : undefined,
  }));
};

export const createAdapterContext = () => createContextState();

export const attachAdapterContext = (
  adapters: AdapterBundle,
  context: AdapterCallContext,
  options?: AdapterContextOptions,
): AdapterBundle => {
  const retryContext = createRetryWrapContext(context, options);
  return {
    ...adapters,
    model: wrapModel(adapters.model, retryContext),
    embedder: wrapEmbedder(adapters.embedder, retryContext),
    image: wrapImage(adapters.image, retryContext),
    retriever: wrapRetriever(adapters.retriever, retryContext),
    reranker: wrapReranker(adapters.reranker, retryContext),
    textSplitter: wrapTextSplitter(adapters.textSplitter, retryContext),
    outputParser: wrapOutputParser(adapters.outputParser, retryContext),
    loader: wrapLoader(adapters.loader, retryContext),
    transformer: wrapTransformer(adapters.transformer, retryContext),
    storage: wrapStorage(adapters.storage, retryContext),
    cache: wrapCache(adapters.cache, retryContext),
    kv: wrapKv(adapters.kv, retryContext),
    memory: wrapMemory(adapters.memory, retryContext),
    speech: wrapSpeech(adapters.speech, retryContext),
    transcription: wrapTranscription(adapters.transcription, retryContext),
    vectorStore: wrapVectorStore(adapters.vectorStore, retryContext),
    queryEngine: wrapQueryEngine(adapters.queryEngine, retryContext),
    responseSynthesizer: wrapResponseSynthesizer(adapters.responseSynthesizer, retryContext),
    tools: wrapTools(adapters.tools, retryContext),
  };
};
