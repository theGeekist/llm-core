import type {
  AdapterBundle,
  AdapterCallContext,
  RetryConfig,
  RetryMetadata,
  RetryPolicy,
} from "#adapters/types";
import type { MaybePromise } from "#shared/maybe";
import {
  mergeRetryConfig,
  type RetryAdapterKind,
  type RetryWrapperInput,
  wrapRetryCall,
} from "./runtime/retry";
import type { TraceEvent } from "#shared/reporting";

export type AdapterContextOptions = {
  retry?: RetryConfig | null;
  retryDefaults?: RetryConfig | null;
  trace?: TraceEvent[];
};

type RetryWrapContext = {
  context: AdapterCallContext;
  retry?: RetryConfig | null;
  trace?: TraceEvent[];
};

type AdapterFunction = (request: object) => MaybePromise<unknown>;

type WrapAdapterMethodInput<TFunction extends AdapterFunction> = {
  context: RetryWrapContext;
  adapterKind: RetryAdapterKind;
  method: string;
  attachContext?: boolean;
  fn: TFunction;
  metadata?: RetryMetadata | null;
};

const createRetryWrapContext = (
  context: AdapterCallContext,
  options?: AdapterContextOptions,
): RetryWrapContext => ({
  context,
  retry: mergeRetryConfig(options?.retryDefaults, options?.retry),
  trace: options?.trace,
});

const readRetryPolicy = (retry: RetryConfig | null | undefined, kind: RetryAdapterKind) =>
  retry?.[kind] ?? null;

const buildRetryWrapperInput = <TFunction extends AdapterFunction>(
  input: WrapAdapterMethodInput<TFunction>,
): RetryWrapperInput<object, unknown> => ({
  adapterKind: input.adapterKind,
  method: input.method,
  call: input.fn as unknown as (request: object) => MaybePromise<unknown>,
  policy: readRetryPolicy(input.context.retry, input.adapterKind),
  metadata: input.metadata,
  trace: input.context.trace,
  context: input.context.context,
});

const wrapAdapterMethod = <TFunction extends AdapterFunction>(
  input: WrapAdapterMethodInput<TFunction>,
): TFunction => {
  const wrapperInput = buildRetryWrapperInput(input);
  return ((request: object) =>
    wrapRetryCall(wrapperInput, request, input.attachContext)) as unknown as TFunction;
};

const canRetryStream = (policy?: RetryPolicy | null, metadata?: RetryMetadata | null) =>
  !!policy && metadata?.restartable === true;

type RetryMethodDescriptor = {
  restartable?: true;
  attachContext?: false;
};

type AdapterForKind<TKind extends RetryAdapterKind> = TKind extends "tools"
  ? NonNullable<AdapterBundle["tools"]>[number]
  : TKind extends keyof AdapterBundle
    ? NonNullable<AdapterBundle[TKind]>
    : never;

type FunctionKey<TAdapter> = {
  [TKey in keyof TAdapter]-?: NonNullable<TAdapter[TKey]> extends (...args: never[]) => unknown
    ? TKey
    : never;
}[keyof TAdapter] &
  string;

type RetryMethodCatalogue = {
  [TKind in RetryAdapterKind]: Partial<
    Record<FunctionKey<AdapterForKind<TKind>>, RetryMethodDescriptor>
  >;
};

export const RETRY_METHODS = {
  model: {
    generate: { attachContext: false },
    stream: { restartable: true, attachContext: false },
  },
  embedder: {
    embed: {},
    embedMany: {},
  },
  retriever: { retrieve: {} },
  reranker: { rerank: {} },
  textSplitter: {
    split: {},
    splitBatch: {},
    splitWithMetadata: {},
  },
  loader: { load: {} },
  transformer: { transform: {} },
  indexing: { index: {} },
  vectorStore: {
    upsert: {},
    delete: {},
  },
  cache: {
    get: {},
    set: {},
    delete: {},
  },
  kv: {
    mget: {},
    mset: {},
    mdelete: {},
    list: {},
  },
  memory: {
    append: {},
    load: {},
    read: {},
    reset: {},
    save: {},
    summarize: {},
  },
  storage: {
    delete: {},
    get: {},
    list: {},
    put: {},
  },
  outputParser: { parse: {} },
  queryEngine: {
    query: {},
    stream: { restartable: true },
  },
  responseSynthesizer: {
    synthesize: {},
    stream: { restartable: true },
  },
  image: { generate: {} },
  speech: { generate: {} },
  transcription: { generate: {} },
  skills: { load: {} },
  tools: { execute: {} },
} as const satisfies RetryMethodCatalogue;

type RetryableFunction = (request: object) => MaybePromise<unknown>;
type RetryableAdapter = Record<string, unknown> & {
  metadata?: { retry?: RetryMetadata | null } | null;
};

const shouldWrapMethod = (
  descriptor: RetryMethodDescriptor,
  policy: RetryPolicy | null | undefined,
  metadata: RetryMetadata | null | undefined,
) => descriptor.restartable !== true || canRetryStream(policy, metadata);

const bindAdapterMethods = (adapter: RetryableAdapter) => {
  const bound: RetryableAdapter = { ...adapter };
  let owner = Object.getPrototypeOf(adapter) as object | null;
  while (owner && owner !== Object.prototype) {
    for (const method of Object.getOwnPropertyNames(owner)) {
      if (method === "constructor") {
        continue;
      }
      const value = adapter[method];
      if (typeof value === "function") {
        bound[method] = value.bind(adapter);
      }
    }
    owner = Object.getPrototypeOf(owner) as object | null;
  }
  return bound;
};

const wrapRetryableAdapter = (
  adapterKind: RetryAdapterKind,
  adapter: RetryableAdapter,
  context: RetryWrapContext,
) => {
  const wrapped = bindAdapterMethods(adapter);
  const metadata = adapter.metadata?.retry;
  const policy = readRetryPolicy(context.retry, adapterKind);
  const descriptors = RETRY_METHODS[adapterKind] as Record<string, RetryMethodDescriptor>;
  for (const [method, descriptor] of Object.entries(descriptors)) {
    const fn = adapter[method];
    if (typeof fn !== "function" || !shouldWrapMethod(descriptor, policy, metadata)) {
      continue;
    }
    wrapped[method] = wrapAdapterMethod({
      context,
      adapterKind,
      method,
      attachContext: descriptor.attachContext !== false,
      fn: fn.bind(adapter) as RetryableFunction,
      metadata,
    });
  }
  return wrapped;
};

const wrapTools = (tools: AdapterBundle["tools"], context: RetryWrapContext) =>
  tools?.map(
    (tool) => wrapRetryableAdapter("tools", tool as RetryableAdapter, context) as typeof tool,
  ) ?? tools;

const wrapAdaptersWithRetry = (
  adapters: AdapterBundle,
  context: RetryWrapContext,
): AdapterBundle => {
  const wrapped = { ...adapters } as Record<string, unknown>;
  for (const adapterKind of Object.keys(RETRY_METHODS) as RetryAdapterKind[]) {
    if (adapterKind === "tools") {
      wrapped.tools = wrapTools(adapters.tools, context);
      continue;
    }
    const adapter = adapters[adapterKind];
    if (adapter) {
      wrapped[adapterKind] = wrapRetryableAdapter(
        adapterKind,
        adapter as RetryableAdapter,
        context,
      );
    }
  }
  return wrapped as AdapterBundle;
};

export type AttachAdapterContextRequest = AdapterContextOptions & {
  adapters: AdapterBundle;
  context: AdapterCallContext;
};

export const attachAdapterContext = ({
  adapters,
  context,
  ...options
}: AttachAdapterContextRequest): AdapterBundle =>
  wrapAdaptersWithRetry(adapters, createRetryWrapContext(context, options));
