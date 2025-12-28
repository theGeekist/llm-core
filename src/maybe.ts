import {
  isPromiseLike,
  maybeAll as pipelineMaybeAll,
  maybeThen,
  maybeTry as pipelineMaybeTry,
} from "@wpkernel/pipeline/core/async-utils";
import type { MaybePromise } from "@wpkernel/pipeline/core";

type MaybeThunk<T> = { (): MaybePromise<T> };
type MaybeHandler<TIn, TOut> = { (value: TIn): MaybePromise<TOut> };
type ErrorHandler<T> = { (error: unknown): MaybePromise<T> };
type MaybeBinary<TFirst, TSecond, TResult> = {
  (first: TFirst, second: TSecond): MaybePromise<TResult>;
};
type MapMaybeOrInput<TIn, TOut> = {
  map: MaybeHandler<TIn, TOut>;
  fallback: () => MaybePromise<TOut>;
};
type TryWrapConfig<Args extends unknown[], T> = {
  onError: ErrorHandler<T>;
  fn: (...args: Args) => MaybePromise<T>;
};

export type { MaybePromise };

type TryWrapInput<Args extends unknown[], T> = {
  fn: (...args: Args) => MaybePromise<T>;
  args: Args;
};

const maybeMapWith = <TIn, TOut>(map: MaybeHandler<TIn, TOut>, value: MaybePromise<TIn>) =>
  maybeThen(value, map);

const maybeChainWith = <TIn, TOut>(next: MaybeHandler<TIn, TOut>, value: MaybePromise<TIn>) =>
  maybeThen(value, next);

const maybeAllWith = <T>(values: Array<MaybePromise<T>>) => pipelineMaybeAll(values);

const returnConstant = <T>(value: T) => value;

const maybeTapApply = <T>(tap: (value: T) => MaybePromise<unknown>, value: T) =>
  maybeThen(tap(value), bindFirst(returnConstant, value));

const maybeTapWith = <T>(tap: (value: T) => MaybePromise<unknown>, value: MaybePromise<T>) =>
  maybeThen(value, bindFirst(maybeTapApply, tap));

const maybeTryWith = <T>(onError: ErrorHandler<T>, run: MaybeThunk<T>) =>
  pipelineMaybeTry(run, onError);

const runTryWrap = <Args extends unknown[], T>(input: TryWrapInput<Args, T>) =>
  input.fn(...input.args);

const tryWrapRun = <Args extends unknown[], T>(config: TryWrapConfig<Args, T>, args: Args) =>
  pipelineMaybeTry(bindFirst(runTryWrap, { fn: config.fn, args }), config.onError);

const tryWrapInvoke = <Args extends unknown[], T>(config: TryWrapConfig<Args, T>, ...args: Args) =>
  tryWrapRun(config, args);

const tryWrapFactory = <Args extends unknown[], T>(
  onError: ErrorHandler<T>,
  fn: (...args: Args) => MaybePromise<T>,
) =>
  bindFirst(tryWrapInvoke as (config: TryWrapConfig<Args, T>, ...args: Args) => MaybePromise<T>, {
    onError,
    fn,
  });

const mapArray = <TIn, TOut>(map: (value: TIn) => TOut, items: TIn[]) => items.map(map);

const maybeMapArrayWith = <TIn, TOut>(map: (value: TIn) => TOut, value: MaybePromise<TIn[]>) =>
  maybeMap(bindFirst(mapArray, map), value);

const maybeMapOrWith = <TIn, TOut>(
  map: MaybeHandler<TIn, TOut>,
  fallback: () => MaybePromise<TOut>,
  value: MaybePromise<TIn | undefined>,
) => {
  const input: MapMaybeOrInput<TIn, TOut> = { map, fallback };
  if (isPromiseLike(value)) {
    return maybeThen(value, bindFirst(maybeMapOrApply, input));
  }
  return maybeMapOrApply(input, value);
};

const maybeMapOrApply = <TIn, TOut>(input: MapMaybeOrInput<TIn, TOut>, value: TIn | undefined) =>
  value === undefined ? input.fallback() : input.map(value);

const maybeMapOrFromInput = <TIn, TOut>(
  input: MapMaybeOrInput<TIn, TOut>,
  value: MaybePromise<TIn | undefined>,
) => maybeMapOrWith(input.map, input.fallback, value);

const bindUnsafe = (fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
  fn.bind(undefined, ...args) as (...rest: unknown[]) => unknown;

const bindFirstWith = <TFirst, TRest extends unknown[], TResult>(
  fn: (first: TFirst, ...rest: TRest) => TResult,
  first: TFirst,
) => bindUnsafe(fn as (...args: unknown[]) => unknown, first) as (...rest: TRest) => TResult;

const bindFirstFactory = <TFirst, TRest extends unknown[], TResult>(
  fn: (first: TFirst, ...rest: TRest) => TResult,
) =>
  bindUnsafe(bindFirstWith as (...args: unknown[]) => unknown, fn) as (
    first: TFirst,
  ) => (...rest: TRest) => TResult;

const partialKWith = <TFirst, TSecond, TResult>(
  fn: MaybeBinary<TFirst, TSecond, TResult>,
  first: TFirst,
) =>
  bindUnsafe(fn as (...args: unknown[]) => unknown, first) as (
    second: TSecond,
  ) => MaybePromise<TResult>;

const partialKFactory = <TFirst, TSecond, TResult>(fn: MaybeBinary<TFirst, TSecond, TResult>) =>
  bindUnsafe(partialKWith as (...args: unknown[]) => unknown, fn) as (
    first: TFirst,
  ) => (second: TSecond) => MaybePromise<TResult>;

const curryKApply = <TFirst, TSecond, TResult>(
  fn: MaybeBinary<TFirst, TSecond, TResult>,
  first: TFirst,
  second: TSecond,
) => fn(first, second);

const curryKWith = <TFirst, TSecond, TResult>(
  fn: MaybeBinary<TFirst, TSecond, TResult>,
  first: TFirst,
) =>
  bindUnsafe(curryKApply as (...args: unknown[]) => unknown, fn, first) as (
    second: TSecond,
  ) => MaybePromise<TResult>;

const curryKFactory = <TFirst, TSecond, TResult>(fn: MaybeBinary<TFirst, TSecond, TResult>) =>
  bindUnsafe(curryKWith as (...args: unknown[]) => unknown, fn) as (
    first: TFirst,
  ) => (second: TSecond) => MaybePromise<TResult>;

export function maybeMap<TIn, TOut>(
  map: MaybeHandler<TIn, TOut>,
  value: MaybePromise<TIn>,
): MaybePromise<TOut>;
export function maybeMap<TIn, TOut>(
  map: MaybeHandler<TIn, TOut>,
): (value: MaybePromise<TIn>) => MaybePromise<TOut>;
export function maybeMap<TIn, TOut>(map: MaybeHandler<TIn, TOut>, value?: MaybePromise<TIn>) {
  if (arguments.length === 1) {
    return bindFirst(maybeMapWith, map);
  }
  return maybeMapWith(map, value as MaybePromise<TIn>);
}

export function maybeChain<TIn, TOut>(
  next: MaybeHandler<TIn, TOut>,
  value: MaybePromise<TIn>,
): MaybePromise<TOut>;
export function maybeChain<TIn, TOut>(
  next: MaybeHandler<TIn, TOut>,
): (value: MaybePromise<TIn>) => MaybePromise<TOut>;
export function maybeChain<TIn, TOut>(next: MaybeHandler<TIn, TOut>, value?: MaybePromise<TIn>) {
  if (arguments.length === 1) {
    return bindFirst(maybeChainWith, next);
  }
  return maybeChainWith(next, value as MaybePromise<TIn>);
}

export function maybeAll<T>(values: Array<MaybePromise<T>>): MaybePromise<T[]>;
export function maybeAll<T>(): (values: Array<MaybePromise<T>>) => MaybePromise<T[]>;
export function maybeAll<T>(values?: Array<MaybePromise<T>>) {
  if (arguments.length === 0) {
    return maybeAllWith;
  }
  return maybeAllWith(values as Array<MaybePromise<T>>);
}

export function maybeTap<TIn>(
  tap: (value: TIn) => MaybePromise<unknown>,
  value: MaybePromise<TIn>,
): MaybePromise<TIn>;
export function maybeTap<TIn>(
  tap: (value: TIn) => MaybePromise<unknown>,
): (value: MaybePromise<TIn>) => MaybePromise<TIn>;
export function maybeTap<TIn>(
  tap: (value: TIn) => MaybePromise<unknown>,
  value?: MaybePromise<TIn>,
) {
  if (arguments.length === 1) {
    return bindFirst(maybeTapWith, tap);
  }
  return maybeTapWith(tap, value as MaybePromise<TIn>);
}

export function maybeTry<T>(onError: ErrorHandler<T>, run: MaybeThunk<T>): MaybePromise<T>;
export function maybeTry<T>(onError: ErrorHandler<T>): (run: MaybeThunk<T>) => MaybePromise<T>;
export function maybeTry<T>(onError: ErrorHandler<T>, run?: MaybeThunk<T>) {
  if (arguments.length === 1) {
    return bindFirst(maybeTryWith, onError);
  }
  return maybeTryWith(onError, run as MaybeThunk<T>);
}

export function tryWrap<Args extends unknown[], T>(
  onError: ErrorHandler<T>,
  fn: (...args: Args) => MaybePromise<T>,
): (...args: Args) => MaybePromise<T>;
export function tryWrap<Args extends unknown[], T>(
  onError: ErrorHandler<T>,
): (fn: (...args: Args) => MaybePromise<T>) => (...args: Args) => MaybePromise<T>;
export function tryWrap<Args extends unknown[], T>(
  onError: ErrorHandler<T>,
  fn?: (...args: Args) => MaybePromise<T>,
) {
  if (arguments.length === 1) {
    return bindFirst(
      tryWrapFactory as (
        onError: ErrorHandler<T>,
        fn: (...args: Args) => MaybePromise<T>,
      ) => (...args: Args) => MaybePromise<T>,
      onError,
    );
  }
  return tryWrapFactory(onError, fn as (...args: Args) => MaybePromise<T>);
}

export function maybeMapArray<TIn, TOut>(
  map: (value: TIn) => TOut,
  value: MaybePromise<TIn[]>,
): MaybePromise<TOut[]>;
export function maybeMapArray<TIn, TOut>(
  map: (value: TIn) => TOut,
): (value: MaybePromise<TIn[]>) => MaybePromise<TOut[]>;
export function maybeMapArray<TIn, TOut>(map: (value: TIn) => TOut, value?: MaybePromise<TIn[]>) {
  if (arguments.length === 1) {
    return bindFirst(maybeMapArrayWith, map);
  }
  return maybeMapArrayWith(map, value as MaybePromise<TIn[]>);
}

export function maybeMapOr<TIn, TOut>(
  map: (value: TIn) => MaybePromise<TOut>,
  fallback: () => MaybePromise<TOut>,
  value: MaybePromise<TIn | undefined>,
): MaybePromise<TOut>;
export function maybeMapOr<TIn, TOut>(
  map: (value: TIn) => MaybePromise<TOut>,
  fallback: () => MaybePromise<TOut>,
): (value: MaybePromise<TIn | undefined>) => MaybePromise<TOut>;
export function maybeMapOr<TIn, TOut>(
  map: (value: TIn) => MaybePromise<TOut>,
  fallback: () => MaybePromise<TOut>,
  value?: MaybePromise<TIn | undefined>,
) {
  if (arguments.length === 2) {
    return bindFirst(maybeMapOrFromInput, { map, fallback });
  }
  return maybeMapOrWith(map, fallback, value as MaybePromise<TIn | undefined>);
}

export function identity<T>(value: T) {
  return value;
}

export const toNull = () => null;
export const toTrue = () => true;
export const toFalse = () => false;
export const isNull = (value: unknown): value is null => value === null;
export const isFalse = (value: unknown): value is false => value === false;

export const toUndefined = () => undefined;

export function bindFirst<TFirst, TRest extends unknown[], TResult>(
  fn: (first: TFirst, ...rest: TRest) => TResult,
  first: TFirst,
): (...rest: TRest) => TResult;
export function bindFirst<TFirst, TRest extends unknown[], TResult>(
  fn: (first: TFirst, ...rest: TRest) => TResult,
): (first: TFirst) => (...rest: TRest) => TResult;
export function bindFirst<TFirst, TRest extends unknown[], TResult>(
  fn: (first: TFirst, ...rest: TRest) => TResult,
  first?: TFirst,
) {
  if (arguments.length === 1) {
    return bindFirstFactory(fn);
  }
  return bindFirstWith(fn, first as TFirst);
}

export function partialK<TFirst, TSecond, TResult>(
  fn: MaybeBinary<TFirst, TSecond, TResult>,
  first: TFirst,
): (second: TSecond) => MaybePromise<TResult>;
export function partialK<TFirst, TSecond, TResult>(
  fn: MaybeBinary<TFirst, TSecond, TResult>,
): (first: TFirst) => (second: TSecond) => MaybePromise<TResult>;
export function partialK<TFirst, TSecond, TResult>(
  fn: MaybeBinary<TFirst, TSecond, TResult>,
  first?: TFirst,
) {
  if (arguments.length === 1) {
    return partialKFactory(fn);
  }
  return partialKWith(fn, first as TFirst);
}

export function curryK<TFirst, TSecond, TResult>(
  fn: MaybeBinary<TFirst, TSecond, TResult>,
  first: TFirst,
  second: TSecond,
): MaybePromise<TResult>;
export function curryK<TFirst, TSecond, TResult>(
  fn: MaybeBinary<TFirst, TSecond, TResult>,
  first: TFirst,
): (second: TSecond) => MaybePromise<TResult>;
export function curryK<TFirst, TSecond, TResult>(
  fn: MaybeBinary<TFirst, TSecond, TResult>,
): (first: TFirst) => (second: TSecond) => MaybePromise<TResult>;
export function curryK<TFirst, TSecond, TResult>(
  fn: MaybeBinary<TFirst, TSecond, TResult>,
  first?: TFirst,
  second?: TSecond,
) {
  if (arguments.length === 1) {
    return curryKFactory(fn);
  }
  if (arguments.length === 2) {
    return curryKWith(fn, first as TFirst);
  }
  return curryKApply(fn, first as TFirst, second as TSecond);
}
