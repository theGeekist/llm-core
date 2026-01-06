import type {
  AdapterCallContext,
  AdapterDiagnostic,
  RetryConfig,
  RetryMetadata,
  RetryPolicy,
  RetryReason,
} from "../../adapters/types";
import type { MaybePromise } from "../../maybe";
import { bindFirst, maybeTry } from "../../maybe";
import { addTraceEvent } from "../trace";
import type { TraceEvent } from "../trace";

export type { RetryConfig } from "../../adapters/types";

export type RetryAdapterKind =
  | "model"
  | "embedder"
  | "retriever"
  | "reranker"
  | "textSplitter"
  | "loader"
  | "transformer"
  | "vectorStore"
  | "cache"
  | "kv"
  | "memory"
  | "storage"
  | "outputParser"
  | "queryEngine"
  | "responseSynthesizer"
  | "image"
  | "speech"
  | "transcription"
  | "tools";

export type RetryPausePayload = {
  adapterKind: RetryAdapterKind;
  method: string;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  retryAt: number;
  reason: RetryReason;
};

type RetryPauseSignal = {
  kind: "retry.pause";
  payload: RetryPausePayload;
};

type RetryCallInput<TArgs extends unknown[], TResult> = {
  adapterKind: RetryAdapterKind;
  method: string;
  call: (...args: [...TArgs, AdapterCallContext?]) => MaybePromise<TResult>;
  args: [...TArgs, AdapterCallContext?];
  policy?: RetryPolicy | null;
  metadata?: RetryMetadata | null;
  trace?: TraceEvent[];
  report?: AdapterCallContext["report"];
};

export type RetryWrapperInput<TArgs extends unknown[], TResult> = {
  adapterKind: RetryAdapterKind;
  method: string;
  call: (...args: [...TArgs, AdapterCallContext?]) => MaybePromise<TResult>;
  policy?: RetryPolicy | null;
  metadata?: RetryMetadata | null;
  trace?: TraceEvent[];
  context: AdapterCallContext;
};

type RetrySignalInput = {
  adapterKind: RetryAdapterKind;
  method: string;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  reason: RetryReason;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object";

const noopReport = (_diagnostic: AdapterDiagnostic) => {
  void _diagnostic;
};

const toRetryReason = (): RetryReason => "unknown";

const createRetryPauseSignal = (payload: RetryPausePayload): RetryPauseSignal => ({
  kind: "retry.pause",
  payload,
});

export const isRetryPauseSignal = (error: unknown): error is RetryPauseSignal => {
  if (!isObject(error)) {
    return false;
  }
  return (error as { kind?: unknown }).kind === "retry.pause";
};

export const readRetryPausePayload = (error: RetryPauseSignal): RetryPausePayload => error.payload;

const normalizePolicy = (
  policy: RetryPolicy | null | undefined,
): RetryPolicy | null | undefined => {
  if (!policy) {
    return null;
  }
  return {
    ...policy,
    maxAttempts: Math.max(1, policy.maxAttempts),
    backoffMs: Math.max(0, policy.backoffMs),
    jitter: policy.jitter ?? "none",
  };
};

const mergeRetryPolicy = (
  defaults: RetryPolicy | null | undefined,
  overrides: RetryPolicy | null | undefined,
) => {
  if (!defaults) {
    return overrides;
  }
  if (!overrides) {
    return defaults;
  }
  return { ...defaults, ...overrides };
};

export const mergeRetryConfig = (
  defaults: RetryConfig | null | undefined,
  overrides: RetryConfig | null | undefined,
): RetryConfig | null | undefined => {
  if (!defaults && !overrides) {
    return null;
  }
  return {
    model: mergeRetryPolicy(defaults?.model, overrides?.model),
    embedder: mergeRetryPolicy(defaults?.embedder, overrides?.embedder),
    retriever: mergeRetryPolicy(defaults?.retriever, overrides?.retriever),
    reranker: mergeRetryPolicy(defaults?.reranker, overrides?.reranker),
    textSplitter: mergeRetryPolicy(defaults?.textSplitter, overrides?.textSplitter),
    loader: mergeRetryPolicy(defaults?.loader, overrides?.loader),
    transformer: mergeRetryPolicy(defaults?.transformer, overrides?.transformer),
    vectorStore: mergeRetryPolicy(defaults?.vectorStore, overrides?.vectorStore),
    cache: mergeRetryPolicy(defaults?.cache, overrides?.cache),
    kv: mergeRetryPolicy(defaults?.kv, overrides?.kv),
    memory: mergeRetryPolicy(defaults?.memory, overrides?.memory),
    storage: mergeRetryPolicy(defaults?.storage, overrides?.storage),
    outputParser: mergeRetryPolicy(defaults?.outputParser, overrides?.outputParser),
    queryEngine: mergeRetryPolicy(defaults?.queryEngine, overrides?.queryEngine),
    responseSynthesizer: mergeRetryPolicy(
      defaults?.responseSynthesizer,
      overrides?.responseSynthesizer,
    ),
    image: mergeRetryPolicy(defaults?.image, overrides?.image),
    speech: mergeRetryPolicy(defaults?.speech, overrides?.speech),
    transcription: mergeRetryPolicy(defaults?.transcription, overrides?.transcription),
    tools: mergeRetryPolicy(defaults?.tools, overrides?.tools),
  };
};

type RetrySelection = {
  policy?: RetryPolicy | null;
  source: "runtime" | "metadata" | "none";
};

const isRetryAllowed = (metadata: RetryMetadata | null | undefined) => metadata?.allowed !== false;

const selectRetryPolicy = (
  policy: RetryPolicy | null | undefined,
  metadata: RetryMetadata | null | undefined,
): RetrySelection => {
  if (policy) {
    return { policy: normalizePolicy(policy), source: "runtime" };
  }
  if (!isRetryAllowed(metadata)) {
    return { source: "none" };
  }
  if (!metadata?.policy) {
    return { source: "none" };
  }
  return { policy: normalizePolicy(metadata.policy), source: "metadata" };
};

const isAllowedRetryReason = (allowed: RetryReason[] | undefined, reason: RetryReason) =>
  allowed ? allowed.includes(reason) : true;

const filterRetryReasons = (policy: RetryPolicy, metadata: RetryMetadata | null | undefined) => {
  if (!metadata?.retryOn || !policy.retryOn) {
    return policy;
  }
  const allowed = policy.retryOn.filter(bindFirst(isAllowedRetryReason, metadata.retryOn));
  return { ...policy, retryOn: allowed };
};

const shouldRetryReason = (policy: RetryPolicy, reason: RetryReason) => {
  if (!policy.retryOn || policy.retryOn.length === 0) {
    return true;
  }
  return policy.retryOn.includes(reason);
};

const jitterDelay = (delayMs: number, jitter: RetryPolicy["jitter"]) => {
  if (jitter === "full") {
    return Math.floor(delayMs / 2);
  }
  return delayMs;
};

const computeDelayMs = (policy: RetryPolicy, attempt: number) => {
  const base = policy.backoffMs;
  const exp = base * Math.pow(2, attempt);
  const capped = policy.maxBackoffMs ? Math.min(exp, policy.maxBackoffMs) : exp;
  return jitterDelay(capped, policy.jitter);
};

const emitRetryTrace = (trace: TraceEvent[] | undefined, data: Record<string, unknown>) => {
  if (!trace) {
    return;
  }
  addTraceEvent(trace, "adapter.retry", data);
};

const emitRetryExhaustedTrace = (
  trace: TraceEvent[] | undefined,
  data: Record<string, unknown>,
) => {
  if (!trace) {
    return;
  }
  addTraceEvent(trace, "adapter.retry.exhausted", data);
};

const reportRetryExhausted = (
  report: AdapterCallContext["report"] | undefined,
  data: Record<string, unknown>,
) => {
  const reporter = report ?? noopReport;
  reporter({
    level: "warn",
    message: "adapter.retry.exhausted",
    data,
  });
};

const toRetryPausePayload = (input: RetrySignalInput): RetryPausePayload => {
  const retryAt = Date.now() + input.delayMs;
  return { ...input, retryAt };
};

const readRetryMode = (policy: RetryPolicy) => policy.mode ?? "pause";

const shouldPauseRetry = (policy: RetryPolicy, delayMs: number) =>
  readRetryMode(policy) === "pause" && delayMs > 0;

type RetryCallState<TArgs extends unknown[], TResult> = {
  input: RetryCallInput<TArgs, TResult>;
  policy: RetryPolicy;
  maxAttempts: number;
  attempt: number;
  lastError?: unknown;
};

const createRetryCallState = <TArgs extends unknown[], TResult>(
  input: RetryCallInput<TArgs, TResult>,
  policy: RetryPolicy,
): RetryCallState<TArgs, TResult> => ({
  input,
  policy,
  maxAttempts: policy.maxAttempts,
  attempt: 0,
  lastError: undefined,
});

const toRetryData = <TArgs extends unknown[], TResult>(
  state: RetryCallState<TArgs, TResult>,
  reason: RetryReason,
) => ({
  adapterKind: state.input.adapterKind,
  method: state.input.method,
  attempt: state.attempt,
  maxAttempts: state.maxAttempts,
  reason,
});

const shouldRetryAttempt = <TArgs extends unknown[], TResult>(
  state: RetryCallState<TArgs, TResult>,
  reason: RetryReason,
) => {
  if (!shouldRetryReason(state.policy, reason)) {
    return false;
  }
  return state.attempt < state.maxAttempts;
};

const handleRetryExhausted = <TArgs extends unknown[], TResult>(
  state: RetryCallState<TArgs, TResult>,
  data: Record<string, unknown>,
  error: unknown,
) => {
  emitRetryExhaustedTrace(state.input.trace, data);
  reportRetryExhausted(state.input.report, data);
  throw error;
};

const runRetryAttempt = <TArgs extends unknown[], TResult>(
  state: RetryCallState<TArgs, TResult>,
): MaybePromise<TResult> =>
  maybeTry(
    bindFirst(handleRetryError<TArgs, TResult>, state),
    bindFirst(runRetryCallAttempt<TArgs, TResult>, state),
  );

const runRetryCallAttempt = <TArgs extends unknown[], TResult>(
  state: RetryCallState<TArgs, TResult>,
) => state.input.call(...state.input.args);

const handleRetryError = <TArgs extends unknown[], TResult>(
  state: RetryCallState<TArgs, TResult>,
  error: unknown,
): MaybePromise<TResult> => {
  state.lastError = error;
  state.attempt += 1;
  const reason = toRetryReason();
  const data = toRetryData(state, reason);
  if (!shouldRetryAttempt(state, reason)) {
    return handleRetryExhausted(state, data, error);
  }
  if (state.attempt >= state.maxAttempts) {
    return handleRetryExhausted(state, data, error);
  }
  const delayMs = computeDelayMs(state.policy, state.attempt - 1);
  emitRetryTrace(state.input.trace, { ...data, delayMs });
  if (shouldPauseRetry(state.policy, delayMs)) {
    throw createRetryPauseSignal(toRetryPausePayload({ ...data, delayMs }));
  }
  return runRetryAttempt(state);
};

const runRetryCall = <TArgs extends unknown[], TResult>(input: RetryCallInput<TArgs, TResult>) => {
  const selection = selectRetryPolicy(input.policy, input.metadata);
  if (!selection.policy) {
    return input.call(...input.args);
  }
  const policy =
    selection.source === "metadata"
      ? filterRetryReasons(selection.policy, input.metadata)
      : selection.policy;
  const state = createRetryCallState(input, policy);
  return runRetryAttempt(state);
};

const buildRetryInput = <TArgs extends unknown[], TResult>(
  input: RetryWrapperInput<TArgs, TResult>,
  args: [...TArgs, AdapterCallContext?],
  overrideContext?: AdapterCallContext,
): RetryCallInput<TArgs, TResult> => ({
  adapterKind: input.adapterKind,
  method: input.method,
  call: input.call,
  args,
  policy: input.policy,
  metadata: input.metadata,
  trace: input.trace,
  report: overrideContext?.report ?? input.context.report,
});

const callWithRetry = <TArgs extends unknown[], TResult>(
  input: RetryWrapperInput<TArgs, TResult>,
  args: [...TArgs, AdapterCallContext?],
  overrideContext?: AdapterCallContext,
) => runRetryCall(buildRetryInput(input, args, overrideContext));

export const wrapRetryCallOne = <TInput, TResult>(
  input: RetryWrapperInput<[TInput], TResult>,
  value: TInput,
  ctx?: AdapterCallContext,
) => callWithRetry(input, [value, ctx ?? input.context], ctx);

export const wrapRetryCallZero = <TResult>(
  input: RetryWrapperInput<[], TResult>,
  ctx?: AdapterCallContext,
) => callWithRetry(input, [ctx ?? input.context], ctx);

export const wrapRetryCallTwo = <TFirst, TSecond, TResult>(
  input: RetryWrapperInput<[TFirst, TSecond], TResult>,
  ...args: [first: TFirst, second: TSecond, ctx?: AdapterCallContext]
) => {
  const ctx = args[2];
  return callWithRetry(input, [args[0], args[1], ctx ?? input.context], ctx);
};

export const wrapRetryCallThree = <TFirst, TSecond, TThird, TResult>(
  input: RetryWrapperInput<[TFirst, TSecond, TThird], TResult>,
  ...args: [first: TFirst, second: TSecond, third: TThird, ctx?: AdapterCallContext]
) => {
  const ctx = args[3];
  return callWithRetry(input, [args[0], args[1], args[2], ctx ?? input.context], ctx);
};

export const selectRetryConfig = (
  config: RetryConfig | null | undefined,
  kind: RetryAdapterKind,
) => {
  if (!config) {
    return null;
  }
  return config[kind] ?? null;
};
