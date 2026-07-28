import type {
  AdapterCallContext,
  AdapterDiagnostic,
  RetryConfig,
  RetryMetadata,
  RetryPolicy,
  RetryReason,
} from "#adapters/types";
import type { MaybePromise } from "#shared/maybe";
import { bindFirst } from "#shared/fp";
import { isPromiseLike, maybeTry } from "#shared/maybe";
import { addTrace } from "#shared/reporting";
import type { TraceEvent } from "#shared/reporting";
import { isRecord } from "#shared/guards";

export type { RetryConfig } from "#adapters/types";

export type RetryAdapterKind = keyof RetryConfig;

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

type RetryCallInput<TRequest extends object, TResult> = {
  adapterKind: RetryAdapterKind;
  method: string;
  call: (request: TRequest) => MaybePromise<TResult>;
  request: TRequest;
  policy?: RetryPolicy | null;
  metadata?: RetryMetadata | null;
  trace?: TraceEvent[];
  report?: AdapterCallContext["report"];
};

export type RetryWrapperInput<TRequest extends object, TResult> = {
  adapterKind: RetryAdapterKind;
  method: string;
  call: (request: TRequest) => MaybePromise<TResult>;
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

const noopReport = (_diagnostic: AdapterDiagnostic) => {
  void _diagnostic;
};

type ErrorRecord = {
  cause?: unknown;
  code?: unknown;
  message?: unknown;
  name?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

const TIMEOUT_CODES = new Set(["ETIMEDOUT", "ESOCKETTIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"]);
const NETWORK_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

const readErrorRecord = (error: unknown): ErrorRecord | null =>
  isRecord(error) ? (error as ErrorRecord) : null;

const readErrorText = (record: ErrorRecord) =>
  [record.name, record.code, record.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

const readErrorStatus = (record: ErrorRecord) => {
  const status = record.status ?? record.statusCode;
  return typeof status === "number" ? status : null;
};

const classifyRetryReason = (error: unknown, seen = new Set<unknown>()): RetryReason => {
  if (seen.has(error)) {
    return "unknown";
  }
  seen.add(error);
  const record = readErrorRecord(error);
  if (!record) {
    return "unknown";
  }
  const status = readErrorStatus(record);
  if (status === 429) {
    return "rate_limit";
  }
  if (status !== null && status >= 500 && status < 600) {
    return "5xx";
  }
  const code = typeof record.code === "string" ? record.code.toUpperCase() : "";
  const text = readErrorText(record);
  if (
    TIMEOUT_CODES.has(code) ||
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("deadline exceeded")
  ) {
    return "timeout";
  }
  if (
    NETWORK_CODES.has(code) ||
    text.includes("network") ||
    text.includes("socket") ||
    text.includes("fetch failed")
  ) {
    return "network";
  }
  if (text.includes("rate limit") || text.includes("too many requests")) {
    return "rate_limit";
  }
  return record.cause === undefined ? "unknown" : classifyRetryReason(record.cause, seen);
};

class RetryTimeoutError extends Error {
  readonly code = "ETIMEDOUT";

  constructor(timeoutMs: number) {
    super(`Adapter call timed out after ${timeoutMs}ms.`);
    this.name = "RetryTimeoutError";
  }
}

const createRetryPauseSignal = (payload: RetryPausePayload): RetryPauseSignal => ({
  kind: "retry.pause",
  payload,
});

export const isRetryPauseSignal = (error: unknown): error is RetryPauseSignal => {
  if (!isRecord(error)) {
    return false;
  }
  return (error as { kind?: unknown }).kind === "retry.pause";
};

export const readRetryPausePayload = (error: RetryPauseSignal): RetryPausePayload => error.payload;

/** @internal */
export const normalizePolicy = (
  policy: RetryPolicy | null | undefined,
): RetryPolicy | null | undefined => {
  if (!policy) {
    return null;
  }
  return {
    ...policy,
    maxAttempts: Math.max(1, policy.maxAttempts),
    backoffMs: Math.max(0, policy.backoffMs),
    timeoutMs:
      typeof policy.timeoutMs === "number" ? Math.max(0, policy.timeoutMs) : policy.timeoutMs,
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
  const kinds = new Set<RetryAdapterKind>([
    ...(Object.keys(defaults ?? {}) as RetryAdapterKind[]),
    ...(Object.keys(overrides ?? {}) as RetryAdapterKind[]),
  ]);
  const merged: RetryConfig = {};
  const target = merged as Record<RetryAdapterKind, RetryPolicy | null | undefined>;
  for (const kind of kinds) {
    target[kind] = mergeRetryPolicy(defaults?.[kind], overrides?.[kind]);
  }
  return merged;
};

/** @internal */
export const selectRetryPolicy = (
  policy: RetryPolicy | null | undefined,
  metadata: RetryMetadata | null | undefined,
) => normalizePolicy(policy ?? metadata?.policy);

const isAllowedRetryReason = (allowed: RetryReason[] | undefined, reason: RetryReason) =>
  allowed ? allowed.includes(reason) : true;

/** @internal */
export const filterRetryReasons = (
  policy: RetryPolicy,
  metadata: RetryMetadata | null | undefined,
) => {
  if (!metadata?.retryOn) {
    return policy;
  }
  if (!policy.retryOn) {
    return { ...policy, retryOn: [...metadata.retryOn] };
  }
  const allowed = policy.retryOn.filter(bindFirst(isAllowedRetryReason, metadata.retryOn));
  return { ...policy, retryOn: allowed };
};

/** @internal */
export const shouldRetryReason = (policy: RetryPolicy, reason: RetryReason) => {
  if (!policy.retryOn) {
    return true;
  }
  return policy.retryOn.includes(reason);
};

/** @internal */
export const jitterDelay = (
  delayMs: number,
  jitter: RetryPolicy["jitter"],
  random: () => number = Math.random,
) => {
  if (jitter === "full") {
    return Math.floor(random() * delayMs);
  }
  return delayMs;
};

/** @internal */
export const computeDelayMs = (policy: RetryPolicy, attempt: number) => {
  const base = policy.backoffMs;
  const exp = base * Math.pow(2, attempt);
  const capped = policy.maxBackoffMs ? Math.min(exp, policy.maxBackoffMs) : exp;
  return jitterDelay(capped, policy.jitter);
};

const emitRetryTrace = (trace: TraceEvent[] | undefined, data: Record<string, unknown>) => {
  if (!trace) {
    return;
  }
  addTrace({ trace }, "adapter.retry", data);
};

const emitRetryExhaustedTrace = (
  trace: TraceEvent[] | undefined,
  data: Record<string, unknown>,
) => {
  if (!trace) {
    return;
  }
  addTrace({ trace }, "adapter.retry.exhausted", data);
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

type RetryCallState<TRequest extends object, TResult> = {
  input: RetryCallInput<TRequest, TResult>;
  policy: RetryPolicy;
  maxAttempts: number;
  attempt: number;
};

const createRetryCallState = <TRequest extends object, TResult>(
  input: RetryCallInput<TRequest, TResult>,
  policy: RetryPolicy,
): RetryCallState<TRequest, TResult> => ({
  input,
  policy,
  maxAttempts: policy.maxAttempts,
  attempt: 0,
});

const toRetryData = <TRequest extends object, TResult>(
  state: RetryCallState<TRequest, TResult>,
  reason: RetryReason,
) => ({
  adapterKind: state.input.adapterKind,
  method: state.input.method,
  attempt: state.attempt,
  maxAttempts: state.maxAttempts,
  reason,
});

const shouldRetryAttempt = <TRequest extends object, TResult>(
  state: RetryCallState<TRequest, TResult>,
  reason: RetryReason,
) => {
  if (!shouldRetryReason(state.policy, reason)) {
    return false;
  }
  return state.attempt < state.maxAttempts;
};

const handleRetryExhausted = <TRequest extends object, TResult>(
  state: RetryCallState<TRequest, TResult>,
  data: Record<string, unknown>,
  error: unknown,
) => {
  emitRetryExhaustedTrace(state.input.trace, data);
  reportRetryExhausted(state.input.report, data);
  throw error;
};

const runRetryAttempt = <TRequest extends object, TResult>(
  state: RetryCallState<TRequest, TResult>,
): MaybePromise<TResult> =>
  maybeTry(
    bindFirst(handleRetryError<TRequest, TResult>, state),
    bindFirst(runRetryCallAttempt<TRequest, TResult>, state),
  );

const runRetryCallAttempt = <TRequest extends object, TResult>(
  state: RetryCallState<TRequest, TResult>,
) => {
  const startedAt = Date.now();
  const result = state.input.call(state.input.request);
  const timeoutMs = state.policy.timeoutMs;
  if (timeoutMs === null || timeoutMs === undefined) {
    return result;
  }
  if (!isPromiseLike(result)) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new RetryTimeoutError(timeoutMs);
    }
    return result;
  }
  return new Promise<TResult>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RetryTimeoutError(timeoutMs)), timeoutMs);
    result.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
};

const waitForRetry = <TRequest extends object, TResult>(
  state: RetryCallState<TRequest, TResult>,
  delayMs: number,
) =>
  new Promise<TResult>((resolve, reject) => {
    setTimeout(() => {
      try {
        Promise.resolve(runRetryAttempt(state)).then(resolve, reject);
      } catch (error) {
        reject(error);
      }
    }, delayMs);
  });

const handleRetryError = <TRequest extends object, TResult>(
  state: RetryCallState<TRequest, TResult>,
  error: unknown,
): MaybePromise<TResult> => {
  state.attempt += 1;
  const reason = classifyRetryReason(error);
  const data = toRetryData(state, reason);
  if (!shouldRetryAttempt(state, reason)) {
    return handleRetryExhausted(state, data, error);
  }
  const delayMs = computeDelayMs(state.policy, state.attempt - 1);
  emitRetryTrace(state.input.trace, { ...data, delayMs });
  if (shouldPauseRetry(state.policy, delayMs)) {
    throw createRetryPauseSignal(toRetryPausePayload({ ...data, delayMs }));
  }
  return delayMs > 0 ? waitForRetry(state, delayMs) : runRetryAttempt(state);
};

const runRetryCall = <TRequest extends object, TResult>(
  input: RetryCallInput<TRequest, TResult>,
) => {
  const selectedPolicy = selectRetryPolicy(input.policy, input.metadata);
  if (!selectedPolicy) {
    return input.call(input.request);
  }
  const policy = filterRetryReasons(selectedPolicy, input.metadata);
  const state = createRetryCallState(input, policy);
  return runRetryAttempt(state);
};

const buildRetryInput = <TRequest extends object, TResult>(
  input: RetryWrapperInput<TRequest, TResult>,
  request: TRequest,
  overrideContext?: AdapterCallContext,
): RetryCallInput<TRequest, TResult> => ({
  adapterKind: input.adapterKind,
  method: input.method,
  call: input.call,
  request,
  policy: input.policy,
  metadata: input.metadata,
  trace: input.trace,
  report: overrideContext?.report ?? input.context.report,
});

const callWithRetry = <TRequest extends object, TResult>(
  input: RetryWrapperInput<TRequest, TResult>,
  request: TRequest,
  overrideContext?: AdapterCallContext,
) => runRetryCall(buildRetryInput(input, request, overrideContext));

export const wrapRetryCall = <TRequest extends object, TResult>(
  input: RetryWrapperInput<TRequest, TResult>,
  request: TRequest,
  attachContext = true,
) => {
  const overrideContext =
    attachContext && "context" in request
      ? (request.context as AdapterCallContext | undefined)
      : undefined;
  const effectiveRequest = attachContext
    ? ({ ...request, context: overrideContext ?? input.context } as TRequest)
    : request;
  return callWithRetry(input, effectiveRequest, overrideContext);
};
