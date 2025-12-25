import type { AdapterBundle, AdapterCallContext, Blob } from "../adapters/types";
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

const wrapRequiredOne =
  <TInput, TResult>(
    fn: (input: TInput, context?: AdapterCallContext) => TResult,
    context: AdapterCallContext,
  ) =>
  (input: TInput, ctx?: AdapterCallContext) =>
    fn(input, ctx ?? context);

const wrapOptionalOne = <TInput, TResult>(
  fn: ((input: TInput, context?: AdapterCallContext) => TResult) | undefined,
  context: AdapterCallContext,
) => (fn ? (input: TInput, ctx?: AdapterCallContext) => fn(input, ctx ?? context) : undefined);

const wrapRequiredTwo =
  <TFirst, TSecond, TResult>(
    fn: (first: TFirst, second: TSecond, context?: AdapterCallContext) => TResult,
    context: AdapterCallContext,
  ) =>
  (first: TFirst, second: TSecond, ctx?: AdapterCallContext) =>
    fn(first, second, ctx ?? context);

const wrapOptionalTwo = <TFirst, TSecond, TResult>(
  fn: ((first: TFirst, second: TSecond, context?: AdapterCallContext) => TResult) | undefined,
  context: AdapterCallContext,
) =>
  fn
    ? (first: TFirst, second: TSecond, ctx?: AdapterCallContext) =>
        fn(first, second, ctx ?? context)
    : undefined;

const wrapOptionalThree = <TFirst, TSecond, TThird, TResult>(
  fn:
    | ((first: TFirst, second: TSecond, third: TThird, context?: AdapterCallContext) => TResult)
    | undefined,
  context: AdapterCallContext,
) =>
  fn
    ? (first: TFirst, second: TSecond, third: TThird, ctx?: AdapterCallContext) =>
        fn(first, second, third, ctx ?? context)
    : undefined;

const wrapEmbedder = (embedder: AdapterBundle["embedder"], context: AdapterCallContext) => {
  if (!embedder) {
    return undefined;
  }
  return {
    ...embedder,
    embed: wrapRequiredOne(embedder.embed, context),
    embedMany: wrapOptionalOne(embedder.embedMany, context),
  };
};

const wrapImage = (image: AdapterBundle["image"], context: AdapterCallContext) => {
  if (!image) {
    return undefined;
  }
  return {
    ...image,
    generate: wrapRequiredOne(image.generate, context),
  };
};

const wrapRetriever = (retriever: AdapterBundle["retriever"], context: AdapterCallContext) => {
  if (!retriever) {
    return undefined;
  }
  return {
    ...retriever,
    retrieve: wrapRequiredOne(retriever.retrieve, context),
  };
};

const wrapReranker = (reranker: AdapterBundle["reranker"], context: AdapterCallContext) => {
  if (!reranker) {
    return undefined;
  }
  return {
    ...reranker,
    rerank: wrapRequiredTwo(reranker.rerank, context),
  };
};

const wrapTextSplitter = (splitter: AdapterBundle["textSplitter"], context: AdapterCallContext) => {
  if (!splitter) {
    return undefined;
  }
  return {
    ...splitter,
    split: wrapRequiredOne(splitter.split, context),
    splitBatch: wrapOptionalOne(splitter.splitBatch, context),
    splitWithMetadata: wrapOptionalOne(splitter.splitWithMetadata, context),
  };
};

const wrapTransformer = (
  transformer: AdapterBundle["transformer"],
  context: AdapterCallContext,
) => {
  if (!transformer) {
    return undefined;
  }
  return {
    ...transformer,
    transform: wrapRequiredOne(transformer.transform, context),
  };
};

const wrapStorage = (storage: AdapterBundle["storage"], context: AdapterCallContext) => {
  if (!storage) {
    return undefined;
  }
  return {
    ...storage,
    get: wrapRequiredOne(storage.get, context),
    put: wrapRequiredTwo(storage.put, context),
    delete: wrapRequiredOne(storage.delete, context),
    list: wrapRequiredOne(storage.list, context),
  };
};

const wrapCache = (cache: AdapterBundle["cache"], context: AdapterCallContext) => {
  if (!cache) {
    return undefined;
  }
  return {
    ...cache,
    get: wrapRequiredOne(cache.get, context),
    set: (key: string, value: Blob, ttlMs?: number, ctx?: AdapterCallContext) =>
      cache.set(key, value, ttlMs, ctx ?? context),
    delete: wrapRequiredOne(cache.delete, context),
  };
};

const wrapKv = (kv: AdapterBundle["kv"], context: AdapterCallContext) => {
  if (!kv) {
    return undefined;
  }
  return {
    ...kv,
    mget: wrapRequiredOne(kv.mget, context),
    mset: wrapRequiredOne(kv.mset, context),
    mdelete: wrapRequiredOne(kv.mdelete, context),
    list: wrapRequiredOne(kv.list, context),
  };
};

const wrapMemory = (memory: AdapterBundle["memory"], context: AdapterCallContext) => {
  if (!memory) {
    return undefined;
  }
  return {
    ...memory,
    append: wrapOptionalTwo(memory.append, context),
    read: wrapOptionalOne(memory.read, context),
    summarize: wrapOptionalOne(memory.summarize, context),
    load: wrapOptionalOne(memory.load, context),
    save: wrapOptionalThree(memory.save, context),
    reset: wrapOptionalOne(memory.reset, context),
  };
};

const wrapSpeech = (speech: AdapterBundle["speech"], context: AdapterCallContext) => {
  if (!speech) {
    return undefined;
  }
  return {
    ...speech,
    generate: wrapRequiredOne(speech.generate, context),
  };
};

const wrapTranscription = (
  transcription: AdapterBundle["transcription"],
  context: AdapterCallContext,
) => {
  if (!transcription) {
    return undefined;
  }
  return {
    ...transcription,
    generate: wrapRequiredOne(transcription.generate, context),
  };
};

const wrapVectorStore = (store: AdapterBundle["vectorStore"], context: AdapterCallContext) => {
  if (!store) {
    return undefined;
  }
  return {
    ...store,
    upsert: wrapRequiredOne(store.upsert, context),
    delete: wrapRequiredOne(store.delete, context),
  };
};

const wrapTools = (tools: AdapterBundle["tools"], context: AdapterCallContext) => {
  if (!tools) {
    return undefined;
  }
  return tools.map((tool) => ({
    ...tool,
    execute: tool.execute
      ? (input: unknown, ctx?: AdapterCallContext) => tool.execute?.(input, ctx ?? context)
      : undefined,
  }));
};

export const createAdapterContext = () => createContextState();

export const attachAdapterContext = (
  adapters: AdapterBundle,
  context: AdapterCallContext,
): AdapterBundle => ({
  ...adapters,
  embedder: wrapEmbedder(adapters.embedder, context),
  image: wrapImage(adapters.image, context),
  retriever: wrapRetriever(adapters.retriever, context),
  reranker: wrapReranker(adapters.reranker, context),
  textSplitter: wrapTextSplitter(adapters.textSplitter, context),
  transformer: wrapTransformer(adapters.transformer, context),
  storage: wrapStorage(adapters.storage, context),
  cache: wrapCache(adapters.cache, context),
  kv: wrapKv(adapters.kv, context),
  memory: wrapMemory(adapters.memory, context),
  speech: wrapSpeech(adapters.speech, context),
  transcription: wrapTranscription(adapters.transcription, context),
  vectorStore: wrapVectorStore(adapters.vectorStore, context),
  tools: wrapTools(adapters.tools, context),
});
