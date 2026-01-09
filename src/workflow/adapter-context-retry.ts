import type { AdapterBundle, AdapterCallContext } from "../adapters/types";
import { bindFirst } from "../shared/fp";
import type { AdapterContextOptions, RetryWrapContext } from "./adapter-context-retry-core";
import {
  buildRetryWrapperInput,
  createRetryWrapContext,
  readRetryPolicy,
  wrapOptionalOne,
  wrapOptionalThree,
  wrapOptionalTwo,
  wrapRequiredOne,
  wrapRequiredThree,
  wrapRequiredTwo,
  wrapRequiredZero,
  wrapRetryStream,
} from "./adapter-context-retry-core";
import { wrapRetryCallOne } from "./runtime/retry";

const wrapEmbedder = (embedder: AdapterBundle["embedder"], input: RetryWrapContext) => {
  if (!embedder) {
    return null;
  }
  const metadata = embedder.metadata?.retry;
  return {
    ...embedder,
    embed: wrapRequiredOne({
      context: input,
      adapterKind: "embedder",
      method: "embed",
      fn: embedder.embed,
      metadata,
    }),
    embedMany: wrapOptionalOne({
      context: input,
      adapterKind: "embedder",
      method: "embedMany",
      fn: embedder.embedMany,
      metadata,
    }),
  };
};

const wrapImage = (image: AdapterBundle["image"], input: RetryWrapContext) => {
  if (!image) {
    return null;
  }
  const metadata = image.metadata?.retry;
  return {
    ...image,
    generate: wrapRequiredOne({
      context: input,
      adapterKind: "image",
      method: "generate",
      fn: image.generate,
      metadata,
    }),
  };
};

const wrapRetriever = (retriever: AdapterBundle["retriever"], input: RetryWrapContext) => {
  if (!retriever) {
    return null;
  }
  const metadata = retriever.metadata?.retry;
  return {
    ...retriever,
    retrieve: wrapRequiredOne({
      context: input,
      adapterKind: "retriever",
      method: "retrieve",
      fn: retriever.retrieve,
      metadata,
    }),
  };
};

const wrapReranker = (reranker: AdapterBundle["reranker"], input: RetryWrapContext) => {
  if (!reranker) {
    return null;
  }
  const metadata = reranker.metadata?.retry;
  return {
    ...reranker,
    rerank: wrapRequiredTwo({
      context: input,
      adapterKind: "reranker",
      method: "rerank",
      fn: reranker.rerank,
      metadata,
    }),
  };
};

const wrapTextSplitter = (splitter: AdapterBundle["textSplitter"], input: RetryWrapContext) => {
  if (!splitter) {
    return null;
  }
  const metadata = splitter.metadata?.retry;
  return {
    ...splitter,
    split: wrapRequiredOne({
      context: input,
      adapterKind: "textSplitter",
      method: "split",
      fn: splitter.split,
      metadata,
    }),
    splitBatch: wrapOptionalOne({
      context: input,
      adapterKind: "textSplitter",
      method: "splitBatch",
      fn: splitter.splitBatch,
      metadata,
    }),
    splitWithMetadata: wrapOptionalOne({
      context: input,
      adapterKind: "textSplitter",
      method: "splitWithMetadata",
      fn: splitter.splitWithMetadata,
      metadata,
    }),
  };
};

const wrapOutputParser = (outputParser: AdapterBundle["outputParser"], input: RetryWrapContext) => {
  if (!outputParser) {
    return null;
  }
  const metadata = outputParser.metadata?.retry;
  return {
    ...outputParser,
    parse: wrapRequiredOne({
      context: input,
      adapterKind: "outputParser",
      method: "parse",
      fn: outputParser.parse,
      metadata,
    }),
    formatInstructions: outputParser.formatInstructions,
  };
};

const wrapModel = (model: AdapterBundle["model"], input: RetryWrapContext) => {
  if (!model) {
    return null;
  }
  const metadata = model.metadata?.retry;
  const policy = readRetryPolicy(input.retry, "model");
  const wrappedStream = wrapRetryStream({
    context: input,
    adapterKind: "model",
    method: "stream",
    stream: model.stream,
    metadata,
    policy,
  });
  return {
    ...model,
    generate: wrapRequiredOne({
      context: input,
      adapterKind: "model",
      method: "generate",
      fn: model.generate,
      metadata,
    }),
    stream: wrappedStream,
  };
};

const wrapLoader = (loader: AdapterBundle["loader"], input: RetryWrapContext) => {
  if (!loader) {
    return null;
  }
  const metadata = loader.metadata?.retry;
  return {
    ...loader,
    load: wrapRequiredZero({
      context: input,
      adapterKind: "loader",
      method: "load",
      fn: loader.load,
      metadata,
    }),
  };
};

const wrapTransformer = (transformer: AdapterBundle["transformer"], input: RetryWrapContext) => {
  if (!transformer) {
    return null;
  }
  const metadata = transformer.metadata?.retry;
  return {
    ...transformer,
    transform: wrapRequiredOne({
      context: input,
      adapterKind: "transformer",
      method: "transform",
      fn: transformer.transform,
      metadata,
    }),
  };
};

const wrapStorage = (storage: AdapterBundle["storage"], input: RetryWrapContext) => {
  if (!storage) {
    return null;
  }
  return {
    ...storage,
    get: wrapRequiredOne({
      context: input,
      adapterKind: "storage",
      method: "get",
      fn: storage.get,
    }),
    put: wrapRequiredTwo({
      context: input,
      adapterKind: "storage",
      method: "put",
      fn: storage.put,
    }),
    delete: wrapRequiredOne({
      context: input,
      adapterKind: "storage",
      method: "delete",
      fn: storage.delete,
    }),
    list: wrapRequiredOne({
      context: input,
      adapterKind: "storage",
      method: "list",
      fn: storage.list,
    }),
  };
};

const wrapCache = (cache: AdapterBundle["cache"], input: RetryWrapContext) => {
  if (!cache) {
    return null;
  }
  return {
    ...cache,
    get: wrapRequiredOne({
      context: input,
      adapterKind: "cache",
      method: "get",
      fn: cache.get,
    }),
    set: wrapRequiredThree({
      context: input,
      adapterKind: "cache",
      method: "set",
      fn: cache.set,
    }),
    delete: wrapRequiredOne({
      context: input,
      adapterKind: "cache",
      method: "delete",
      fn: cache.delete,
    }),
  };
};

const wrapKv = (kv: AdapterBundle["kv"], input: RetryWrapContext) => {
  if (!kv) {
    return null;
  }
  return {
    ...kv,
    mget: wrapRequiredOne({
      context: input,
      adapterKind: "kv",
      method: "mget",
      fn: kv.mget,
    }),
    mset: wrapRequiredOne({
      context: input,
      adapterKind: "kv",
      method: "mset",
      fn: kv.mset,
    }),
    mdelete: wrapRequiredOne({
      context: input,
      adapterKind: "kv",
      method: "mdelete",
      fn: kv.mdelete,
    }),
    list: wrapRequiredOne({
      context: input,
      adapterKind: "kv",
      method: "list",
      fn: kv.list,
    }),
  };
};

const wrapMemory = (memory: AdapterBundle["memory"], input: RetryWrapContext) => {
  if (!memory) {
    return null;
  }
  const metadata = memory.metadata?.retry;
  return {
    ...memory,
    append: wrapOptionalTwo({
      context: input,
      adapterKind: "memory",
      method: "append",
      fn: memory.append,
      metadata,
    }),
    read: wrapOptionalOne({
      context: input,
      adapterKind: "memory",
      method: "read",
      fn: memory.read,
      metadata,
    }),
    summarize: wrapOptionalOne({
      context: input,
      adapterKind: "memory",
      method: "summarize",
      fn: memory.summarize,
      metadata,
    }),
    load: wrapOptionalOne({
      context: input,
      adapterKind: "memory",
      method: "load",
      fn: memory.load,
      metadata,
    }),
    save: wrapOptionalThree({
      context: input,
      adapterKind: "memory",
      method: "save",
      fn: memory.save,
      metadata,
    }),
    reset: wrapOptionalOne({
      context: input,
      adapterKind: "memory",
      method: "reset",
      fn: memory.reset,
      metadata,
    }),
  };
};

const wrapSpeech = (speech: AdapterBundle["speech"], input: RetryWrapContext) => {
  if (!speech) {
    return null;
  }
  const metadata = speech.metadata?.retry;
  return {
    ...speech,
    generate: wrapRequiredOne({
      context: input,
      adapterKind: "speech",
      method: "generate",
      fn: speech.generate,
      metadata,
    }),
  };
};

const wrapTranscription = (
  transcription: AdapterBundle["transcription"],
  input: RetryWrapContext,
) => {
  if (!transcription) {
    return null;
  }
  const metadata = transcription.metadata?.retry;
  return {
    ...transcription,
    generate: wrapRequiredOne({
      context: input,
      adapterKind: "transcription",
      method: "generate",
      fn: transcription.generate,
      metadata,
    }),
  };
};

const wrapVectorStore = (store: AdapterBundle["vectorStore"], input: RetryWrapContext) => {
  if (!store) {
    return null;
  }
  const metadata = store.metadata?.retry;
  return {
    ...store,
    upsert: wrapRequiredOne({
      context: input,
      adapterKind: "vectorStore",
      method: "upsert",
      fn: store.upsert,
      metadata,
    }),
    delete: wrapRequiredOne({
      context: input,
      adapterKind: "vectorStore",
      method: "delete",
      fn: store.delete,
      metadata,
    }),
  };
};

const wrapQueryEngine = (engine: AdapterBundle["queryEngine"], input: RetryWrapContext) => {
  if (!engine) {
    return null;
  }
  const metadata = engine.metadata?.retry;
  const policy = readRetryPolicy(input.retry, "queryEngine");
  const wrappedStream = wrapRetryStream({
    context: input,
    adapterKind: "queryEngine",
    method: "stream",
    stream: engine.stream,
    metadata,
    policy,
  });
  return {
    ...engine,
    query: wrapRequiredOne({
      context: input,
      adapterKind: "queryEngine",
      method: "query",
      fn: engine.query,
      metadata,
    }),
    stream: wrappedStream,
  };
};

const wrapResponseSynthesizer = (
  synthesizer: AdapterBundle["responseSynthesizer"],
  input: RetryWrapContext,
) => {
  if (!synthesizer) {
    return null;
  }
  const metadata = synthesizer.metadata?.retry;
  const policy = readRetryPolicy(input.retry, "responseSynthesizer");
  const wrappedStream = wrapRetryStream({
    context: input,
    adapterKind: "responseSynthesizer",
    method: "stream",
    stream: synthesizer.stream,
    metadata,
    policy,
  });
  return {
    ...synthesizer,
    synthesize: wrapRequiredOne({
      context: input,
      adapterKind: "responseSynthesizer",
      method: "synthesize",
      fn: synthesizer.synthesize,
      metadata,
    }),
    stream: wrappedStream,
  };
};

type ToolAdapter = NonNullable<AdapterBundle["tools"]>[number];

const wrapToolExecute = (input: RetryWrapContext, tool: ToolAdapter): ToolAdapter => ({
  ...tool,
  execute: tool.execute
    ? bindFirst(
        wrapRetryCallOne,
        buildRetryWrapperInput({
          context: input,
          adapterKind: "tools",
          method: "execute",
          call: tool.execute,
          metadata: tool.metadata?.retry,
        }),
      )
    : null,
});

const wrapTools = (tools: AdapterBundle["tools"], input: RetryWrapContext) => {
  if (!tools) {
    return null;
  }
  return tools.map(bindFirst(wrapToolExecute, input));
};

const wrapAdaptersWithRetry = (adapters: AdapterBundle, retryContext: RetryWrapContext) => ({
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
});

export const attachAdapterContext = (
  adapters: AdapterBundle,
  context: AdapterCallContext,
  options?: AdapterContextOptions,
): AdapterBundle => wrapAdaptersWithRetry(adapters, createRetryWrapContext(context, options));

export type { AdapterContextOptions };
