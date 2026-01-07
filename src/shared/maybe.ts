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

type AnyIterable<T> = Iterable<T> | AsyncIterable<T>;
export type Step<T> = { readonly next: () => MaybePromise<IteratorResult<T>> };
type StepSource<T> = AnyIterable<T> | Step<T>;
type CollectStepInput<T> = { step: Step<T>; items: T[] };

export type { MaybePromise };
export type MaybeAsyncIterable<T> = StepSource<T> | MaybePromise<StepSource<T>>;
export { isPromiseLike };

type TryWrapInput<Args extends unknown[], T> = {
  fn: (...args: Args) => MaybePromise<T>;
  args: Args;
};

const maybeMapWith = <TIn, TOut>(map: MaybeHandler<TIn, TOut>, value: MaybePromise<TIn>) =>
  maybeThen(value, map);

const maybeChainWith = <TIn, TOut>(next: MaybeHandler<TIn, TOut>, value: MaybePromise<TIn>) =>
  maybeThen(value, next);

const maybeAllWith = <T>(values: Array<MaybePromise<T>>) => {
  const result = pipelineMaybeAll(values);
  if (isPromiseLike(result)) {
    return result;
  }
  return result.slice();
};

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
  value: MaybePromise<TIn | null | undefined>,
) => {
  const input: MapMaybeOrInput<TIn, TOut> = { map, fallback };
  if (isPromiseLike(value)) {
    return maybeThen(value, bindFirst(maybeMapOrApply, input));
  }
  return maybeMapOrApply(input, value);
};

const maybeMapOrApply = <TIn, TOut>(
  input: MapMaybeOrInput<TIn, TOut>,
  value: TIn | null | undefined,
) => (value === undefined || value === null ? input.fallback() : input.map(value));

const maybeMapOrFromInput = <TIn, TOut>(
  input: MapMaybeOrInput<TIn, TOut>,
  value: MaybePromise<TIn | null | undefined>,
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

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
  !!value && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function";

const isStep = (value: unknown): value is Step<unknown> =>
  !!value && typeof (value as Step<unknown>).next === "function";

const readIterator = <T>(iterable: Iterable<T>) => iterable[Symbol.iterator]();

const readAsyncIterator = <T>(iterable: AsyncIterable<T>) => iterable[Symbol.asyncIterator]();

const runIteratorNext = <T>(iterator: Iterator<T>) => iterator.next();

const runAsyncIteratorNext = <T>(iterator: AsyncIterator<T>) => iterator.next();

const toStepFromIterator = <T>(iterator: Iterator<T>): Step<T> => ({
  next: bindFirst(runIteratorNext, iterator),
});

const toStepFromAsyncIterator = <T>(iterator: AsyncIterator<T>): Step<T> => ({
  next: bindFirst(runAsyncIteratorNext, iterator),
});

const toStepFromIterable = <T>(iterable: Iterable<T>) => toStepFromIterator(readIterator(iterable));

const toStepFromAsyncIterable = <T>(iterable: AsyncIterable<T>) =>
  toStepFromAsyncIterator(readAsyncIterator(iterable));

export const toStep = <T>(value: StepSource<T>): Step<T> => {
  if (isStep(value)) {
    return value;
  }
  if (isAsyncIterable(value)) {
    return toStepFromAsyncIterable(value);
  }
  return toStepFromIterable(value);
};

export const maybeToStep = <T>(value: MaybeAsyncIterable<T>) => maybeMap(toStep, value);

const collectStepAsync = async <T>(input: CollectStepInput<T>): Promise<T[]> => {
  let result = await input.step.next();
  while (!result.done) {
    input.items.push(result.value);
    result = await input.step.next();
  }
  return input.items;
};

const collectStepAsyncFromResult = async <T>(
  input: CollectStepInput<T>,
  first: IteratorResult<T>,
): Promise<T[]> => {
  if (first.done) {
    return input.items;
  }
  input.items.push(first.value);
  return collectStepAsync(input);
};

export const collectStep = <T>(step: Step<T>): MaybePromise<T[]> => {
  const input: CollectStepInput<T> = { step, items: [] };
  let result = step.next();
  while (!isPromiseLike(result)) {
    if (result.done) {
      return input.items;
    }
    input.items.push(result.value);
    result = step.next();
  }
  return maybeThen(result, bindFirst(collectStepAsyncFromResult, input));
};

const toAsyncIterableFromIterable = async function* <T>(iterable: Iterable<T>): AsyncIterable<T> {
  for (const item of iterable) {
    yield item;
  }
};

export const toAsyncIterable = <T>(iterable: AnyIterable<T>): AsyncIterable<T> =>
  isAsyncIterable(iterable) ? iterable : toAsyncIterableFromIterable(iterable);

const toAsyncIterableFromStep = async function* <T>(step: Step<T>): AsyncIterable<T> {
  while (true) {
    const result = await step.next();
    if (result.done) {
      return;
    }
    yield result.value;
  }
};

const toAsyncIterableMaybeStep = <T>(value: StepSource<T>): AsyncIterable<T> => {
  if (isStep(value)) {
    return toAsyncIterableFromStep(value);
  }
  if (isAsyncIterable(value)) {
    return value;
  }
  return toAsyncIterableFromIterable(value);
};

export const maybeToAsyncIterable = <T>(value: MaybeAsyncIterable<T>) =>
  maybeMap(toAsyncIterableMaybeStep, value);

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
  value: MaybePromise<TIn | null | undefined>,
): MaybePromise<TOut>;
export function maybeMapOr<TIn, TOut>(
  map: (value: TIn) => MaybePromise<TOut>,
  fallback: () => MaybePromise<TOut>,
): (value: MaybePromise<TIn | null | undefined>) => MaybePromise<TOut>;
export function maybeMapOr<TIn, TOut>(
  map: (value: TIn) => MaybePromise<TOut>,
  fallback: () => MaybePromise<TOut>,
  value?: MaybePromise<TIn | null | undefined>,
) {
  if (arguments.length === 2) {
    return bindFirst(maybeMapOrFromInput, { map, fallback });
  }
  return maybeMapOrWith(map, fallback, value as MaybePromise<TIn | null | undefined>);
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
export const toArray = (value: string | string[]) => (Array.isArray(value) ? value : [value]);
