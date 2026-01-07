import type {
  AdapterCallContext,
  RetryConfig,
  RetryMetadata,
  RetryPolicy,
} from "../adapters/types";
import type { MaybePromise } from "../shared/maybe";
import { bindFirst } from "../shared/maybe";
import type { TraceEvent } from "../shared/trace";
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

export type AdapterContextOptions = {
  retry?: RetryConfig | null;
  retryDefaults?: RetryConfig | null;
  trace?: TraceEvent[];
};

export type RetryWrapContext = {
  context: AdapterCallContext;
  retry?: RetryConfig | null;
  retryDefaults?: RetryConfig | null;
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

export const createRetryWrapContext = (
  context: AdapterCallContext,
  options?: AdapterContextOptions,
): RetryWrapContext => ({
  context,
  retry: mergeRetryConfig(options?.retryDefaults, options?.retry),
  retryDefaults: options?.retryDefaults,
  trace: options?.trace,
});

export const readRetryPolicy = (retry: RetryConfig | null | undefined, kind: RetryAdapterKind) =>
  selectRetryConfig(retry, kind);

type BuildRetryWrapperInputInput<TArgs extends unknown[], TResult> = {
  context: RetryWrapContext;
  adapterKind: RetryAdapterKind;
  method: string;
  call: (...args: [...TArgs, AdapterCallContext?]) => MaybePromise<TResult>;
  metadata?: RetryMetadata | null;
};

export const buildRetryWrapperInput = <TArgs extends unknown[], TResult>(
  input: BuildRetryWrapperInputInput<TArgs, TResult>,
): RetryWrapperInput<TArgs, TResult> => ({
  adapterKind: input.adapterKind,
  method: input.method,
  call: input.call,
  policy: readRetryPolicy(input.context.retry, input.adapterKind),
  metadata: input.metadata,
  trace: input.context.trace,
  context: input.context.context,
});

type WrapRequiredOneInput<TInput, TResult> = {
  context: RetryWrapContext;
  adapterKind: RetryAdapterKind;
  method: string;
  fn: AdapterFnOne<TInput, TResult>;
  metadata?: RetryMetadata | null;
};

export const wrapRequiredOne = <TInput, TResult>(input: WrapRequiredOneInput<TInput, TResult>) =>
  bindFirst(
    wrapRetryCallOne<TInput, TResult>,
    buildRetryWrapperInput<[TInput], TResult>({
      context: input.context,
      adapterKind: input.adapterKind,
      method: input.method,
      call: input.fn,
      metadata: input.metadata,
    }),
  );

type WrapOptionalOneInput<TInput, TResult> = {
  context: RetryWrapContext;
  adapterKind: RetryAdapterKind;
  method: string;
  fn: AdapterFnOne<TInput, TResult> | undefined;
  metadata?: RetryMetadata | null;
};

export const wrapOptionalOne = <TInput, TResult>(input: WrapOptionalOneInput<TInput, TResult>) =>
  input.fn
    ? bindFirst(
        wrapRetryCallOne<TInput, TResult>,
        buildRetryWrapperInput<[TInput], TResult>({
          context: input.context,
          adapterKind: input.adapterKind,
          method: input.method,
          call: input.fn,
          metadata: input.metadata,
        }),
      )
    : undefined;

type WrapRequiredZeroInput<TResult> = {
  context: RetryWrapContext;
  adapterKind: RetryAdapterKind;
  method: string;
  fn: AdapterFnZero<TResult>;
  metadata?: RetryMetadata | null;
};

export const wrapRequiredZero = <TResult>(input: WrapRequiredZeroInput<TResult>) =>
  bindFirst(
    wrapRetryCallZero<TResult>,
    buildRetryWrapperInput<[], TResult>({
      context: input.context,
      adapterKind: input.adapterKind,
      method: input.method,
      call: input.fn,
      metadata: input.metadata,
    }),
  );

type WrapRequiredTwoInput<TFirst, TSecond, TResult> = {
  context: RetryWrapContext;
  adapterKind: RetryAdapterKind;
  method: string;
  fn: AdapterFnTwo<TFirst, TSecond, TResult>;
  metadata?: RetryMetadata | null;
};

export const wrapRequiredTwo = <TFirst, TSecond, TResult>(
  input: WrapRequiredTwoInput<TFirst, TSecond, TResult>,
) =>
  bindFirst(
    wrapRetryCallTwo<TFirst, TSecond, TResult>,
    buildRetryWrapperInput<[TFirst, TSecond], TResult>({
      context: input.context,
      adapterKind: input.adapterKind,
      method: input.method,
      call: input.fn,
      metadata: input.metadata,
    }),
  );

type WrapRequiredThreeInput<TFirst, TSecond, TThird, TResult> = {
  context: RetryWrapContext;
  adapterKind: RetryAdapterKind;
  method: string;
  fn: AdapterFnThree<TFirst, TSecond, TThird, TResult>;
  metadata?: RetryMetadata | null;
};

export const wrapRequiredThree = <TFirst, TSecond, TThird, TResult>(
  input: WrapRequiredThreeInput<TFirst, TSecond, TThird, TResult>,
) =>
  bindFirst(
    wrapRetryCallThree<TFirst, TSecond, TThird, TResult>,
    buildRetryWrapperInput<[TFirst, TSecond, TThird], TResult>({
      context: input.context,
      adapterKind: input.adapterKind,
      method: input.method,
      call: input.fn,
      metadata: input.metadata,
    }),
  );

type WrapOptionalTwoInput<TFirst, TSecond, TResult> = {
  context: RetryWrapContext;
  adapterKind: RetryAdapterKind;
  method: string;
  fn: AdapterFnTwo<TFirst, TSecond, TResult> | undefined;
  metadata?: RetryMetadata | null;
};

export const wrapOptionalTwo = <TFirst, TSecond, TResult>(
  input: WrapOptionalTwoInput<TFirst, TSecond, TResult>,
) =>
  input.fn
    ? bindFirst(
        wrapRetryCallTwo<TFirst, TSecond, TResult>,
        buildRetryWrapperInput<[TFirst, TSecond], TResult>({
          context: input.context,
          adapterKind: input.adapterKind,
          method: input.method,
          call: input.fn,
          metadata: input.metadata,
        }),
      )
    : undefined;

type WrapOptionalThreeInput<TFirst, TSecond, TThird, TResult> = {
  context: RetryWrapContext;
  adapterKind: RetryAdapterKind;
  method: string;
  fn: AdapterFnThree<TFirst, TSecond, TThird, TResult> | undefined;
  metadata?: RetryMetadata | null;
};

export const wrapOptionalThree = <TFirst, TSecond, TThird, TResult>(
  input: WrapOptionalThreeInput<TFirst, TSecond, TThird, TResult>,
) =>
  input.fn
    ? bindFirst(
        wrapRetryCallThree<TFirst, TSecond, TThird, TResult>,
        buildRetryWrapperInput<[TFirst, TSecond, TThird], TResult>({
          context: input.context,
          adapterKind: input.adapterKind,
          method: input.method,
          call: input.fn,
          metadata: input.metadata,
        }),
      )
    : undefined;

const canRetryStream = (policy?: RetryPolicy | null, metadata?: RetryMetadata | null) =>
  !!policy && metadata?.restartable === true;

type WrapRetryStreamInput<TInput, TResult> = {
  context: RetryWrapContext;
  adapterKind: RetryAdapterKind;
  method: string;
  stream: AdapterFnOne<TInput, TResult> | undefined;
  metadata: RetryMetadata | null | undefined;
  policy: RetryPolicy | null | undefined;
};

export const wrapRetryStream = <TInput, TResult>(input: WrapRetryStreamInput<TInput, TResult>) =>
  input.stream && canRetryStream(input.policy, input.metadata)
    ? wrapRequiredOne({
        context: input.context,
        adapterKind: input.adapterKind,
        method: input.method,
        fn: input.stream,
        metadata: input.metadata,
      })
    : input.stream;
