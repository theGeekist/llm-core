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

type AdapterFunction = (...args: never[]) => MaybePromise<unknown>;

type WrapAdapterMethodInput<TFunction extends AdapterFunction> = {
  context: RetryWrapContext;
  adapterKind: RetryAdapterKind;
  method: string;
  domainArity: number;
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
): RetryWrapperInput<unknown[], unknown> => ({
  adapterKind: input.adapterKind,
  method: input.method,
  call: input.fn as unknown as (...args: unknown[]) => MaybePromise<unknown>,
  policy: readRetryPolicy(input.context.retry, input.adapterKind),
  metadata: input.metadata,
  trace: input.context.trace,
  context: input.context.context,
});

const wrapAdapterMethod = <TFunction extends AdapterFunction>(
  input: WrapAdapterMethodInput<TFunction>,
): TFunction => {
  const wrapperInput = buildRetryWrapperInput(input);
  return ((...args: unknown[]) =>
    wrapRetryCall(wrapperInput, input.domainArity, ...args)) as unknown as TFunction;
};

const canRetryStream = (policy?: RetryPolicy | null, metadata?: RetryMetadata | null) =>
  !!policy && metadata?.restartable === true;

type RetryMethodDescriptor = {
  domainArity: 0 | 1 | 2 | 3;
  restartable?: true;
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

/**
 * The domain arity excludes the optional AdapterCallContext. Keeping that fact in
 * one catalogue prevents optional domain arguments from being mistaken for context.
 */
export const RETRY_METHODS = {
  model: {
    generate: { domainArity: 1 },
    stream: { domainArity: 1, restartable: true },
  },
  embedder: {
    embed: { domainArity: 1 },
    embedMany: { domainArity: 1 },
  },
  retriever: { retrieve: { domainArity: 1 } },
  reranker: { rerank: { domainArity: 2 } },
  textSplitter: {
    split: { domainArity: 1 },
    splitBatch: { domainArity: 1 },
    splitWithMetadata: { domainArity: 1 },
  },
  loader: { load: { domainArity: 0 } },
  transformer: { transform: { domainArity: 1 } },
  vectorStore: {
    upsert: { domainArity: 1 },
    delete: { domainArity: 1 },
  },
  cache: {
    get: { domainArity: 1 },
    set: { domainArity: 3 },
    delete: { domainArity: 1 },
  },
  kv: {
    mget: { domainArity: 1 },
    mset: { domainArity: 1 },
    mdelete: { domainArity: 1 },
    list: { domainArity: 1 },
  },
  memory: {
    append: { domainArity: 2 },
    load: { domainArity: 1 },
    read: { domainArity: 1 },
    reset: { domainArity: 0 },
    save: { domainArity: 2 },
    summarize: { domainArity: 1 },
  },
  storage: {
    delete: { domainArity: 1 },
    get: { domainArity: 1 },
    list: { domainArity: 1 },
    put: { domainArity: 2 },
  },
  outputParser: { parse: { domainArity: 1 } },
  queryEngine: {
    query: { domainArity: 1 },
    stream: { domainArity: 1, restartable: true },
  },
  responseSynthesizer: {
    synthesize: { domainArity: 1 },
    stream: { domainArity: 1, restartable: true },
  },
  image: { generate: { domainArity: 1 } },
  speech: { generate: { domainArity: 1 } },
  transcription: { generate: { domainArity: 1 } },
  tools: { execute: { domainArity: 1 } },
} as const satisfies RetryMethodCatalogue;

type RetryableFunction = (...args: never[]) => MaybePromise<unknown>;
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
      domainArity: descriptor.domainArity,
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

export const attachAdapterContext = (
  adapters: AdapterBundle,
  context: AdapterCallContext,
  options?: AdapterContextOptions,
): AdapterBundle => wrapAdaptersWithRetry(adapters, createRetryWrapContext(context, options));
