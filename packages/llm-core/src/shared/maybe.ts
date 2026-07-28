import {
  isPromiseLike,
  maybeAll as pipelineMaybeAll,
  maybeThen,
  maybeTry as pipelineMaybeTry,
} from "@wpkernel/pipeline/core/async-utils";
import type { MaybePromise, Program } from "@wpkernel/pipeline/core";
import { bindFirst } from "./fp";

type MaybeThunk<T> = { (): MaybePromise<T> };
type Mapper<TIn, TOut> = { (value: TIn): TOut };
type MaybeHandler<TIn, TOut> = { (value: TIn): MaybePromise<TOut> };
type ErrorHandler<T> = { (error: unknown): MaybePromise<T> };
type MaybeReducer<TState, TValue> = {
  (state: TState, value: TValue): MaybePromise<TState>;
};

type AnyIterable<T> = Iterable<T> | AsyncIterable<T>;
export type Step<T> = { readonly next: () => MaybePromise<IteratorResult<T>> };
type StepSource<T> = AnyIterable<T> | Step<T>;
type FoldStepInput<T, TState> = {
  step: Step<T>;
  reduce: (state: TState, value: T) => MaybePromise<TState>;
};

export type { MaybePromise };
export type { Program };
export type MaybeAsyncIterable<T> = StepSource<T> | MaybePromise<StepSource<T>>;
export { isPromiseLike };

const maybeMapWith = <TIn, TOut>(map: Mapper<TIn, TOut>, value: MaybePromise<TIn>) =>
  maybeThen(value, map);

const maybeChainWith = <TIn, TOut>(next: MaybeHandler<TIn, TOut>, value: MaybePromise<TIn>) =>
  maybeThen(value, next);

const applyComposeK = (fns: readonly MaybeHandler<unknown, unknown>[], value: unknown) => {
  let result: MaybePromise<unknown> = value;
  for (let index = fns.length - 1; index >= 0; index -= 1) {
    const fn = fns[index];
    if (!fn) {
      continue;
    }
    result = maybeThen(result, fn);
  }
  return result;
};

export function composeK<TIn, TOut>(
  fn: MaybeHandler<TIn, TOut>,
): (value: TIn) => MaybePromise<TOut>;
export function composeK<TIn, TMid, TOut>(
  fn1: MaybeHandler<TMid, TOut>,
  fn2: MaybeHandler<TIn, TMid>,
): (value: TIn) => MaybePromise<TOut>;
export function composeK<TIn, TMid, TMid2, TOut>(
  fn1: MaybeHandler<TMid2, TOut>,
  fn2: MaybeHandler<TMid, TMid2>,
  fn3: MaybeHandler<TIn, TMid>,
): (value: TIn) => MaybePromise<TOut>;
export function composeK<TIn, TMid, TMid2, TMid3, TOut>(
  fn1: MaybeHandler<TMid3, TOut>,
  fn2: MaybeHandler<TMid2, TMid3>,
  fn3: MaybeHandler<TMid, TMid2>,
  fn4: MaybeHandler<TIn, TMid>,
): (value: TIn) => MaybePromise<TOut>;
export function composeK<TIn, TMid, TMid2, TMid3, TMid4, TOut>(
  fn1: MaybeHandler<TMid4, TOut>,
  fn2: MaybeHandler<TMid3, TMid4>,
  fn3: MaybeHandler<TMid2, TMid3>,
  fn4: MaybeHandler<TMid, TMid2>,
  fn5: MaybeHandler<TIn, TMid>,
): (value: TIn) => MaybePromise<TOut>;
export function composeK<TIn, TMid, TMid2, TMid3, TMid4, TMid5, TOut>(
  fn1: MaybeHandler<TMid5, TOut>,
  fn2: MaybeHandler<TMid4, TMid5>,
  fn3: MaybeHandler<TMid3, TMid4>,
  fn4: MaybeHandler<TMid2, TMid3>,
  fn5: MaybeHandler<TMid, TMid2>,
  fn6: MaybeHandler<TIn, TMid>,
): (value: TIn) => MaybePromise<TOut>;
export function composeK<S>(...fns: Program<S>[]): Program<S>;
export function composeK(...fns: Array<MaybeHandler<unknown, unknown>>) {
  return bindFirst(applyComposeK, fns);
}

const returnConstant = <T>(value: T) => value;

const maybeTapApply = <T>(tap: (value: T) => MaybePromise<unknown>, value: T) =>
  maybeThen(tap(value), bindFirst(returnConstant, value));

const maybeTapWith = <T>(tap: (value: T) => MaybePromise<unknown>, value: MaybePromise<T>) =>
  maybeThen(value, bindFirst(maybeTapApply, tap));

const maybeTryWith = <T>(onError: ErrorHandler<T>, run: MaybeThunk<T>) =>
  pipelineMaybeTry(run, onError);

const maybeMapArrayWith = <TIn, TOut>(map: (value: TIn) => TOut, value: MaybePromise<TIn[]>) =>
  maybeMap((items) => items.map(map), value);

const maybeMapOrWith = <TIn, TOut>(
  map: MaybeHandler<TIn, TOut>,
  fallback: () => MaybePromise<TOut>,
  value: MaybePromise<TIn | null | undefined>,
) => {
  const applyLogic = (val: TIn | null | undefined) => (val == null ? fallback() : map(val));
  return maybeThen(value, applyLogic);
};

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

const foldStepAsyncFromNext = async <T, TState>(
  input: FoldStepInput<T, TState>,
  initial: TState,
  pending: MaybePromise<IteratorResult<T>>,
): Promise<TState> => {
  let state = initial;
  let result = await pending;
  while (!result.done) {
    state = await input.reduce(state, result.value);
    result = await input.step.next();
  }
  return state;
};

const foldStepAsyncFromReduce = async <T, TState>(
  input: FoldStepInput<T, TState>,
  pending: PromiseLike<TState>,
): Promise<TState> => {
  const state = await pending;
  return foldStepAsyncFromNext(input, state, input.step.next());
};

export const foldStep = <T, TState>(
  reduce: (state: TState, value: T) => MaybePromise<TState>,
  initial: TState,
  step: Step<T>,
): MaybePromise<TState> => {
  const input = { step, reduce };
  let state = initial;
  let result = step.next();
  while (!isPromiseLike(result)) {
    if (result.done) {
      return state;
    }
    const reduced = reduce(state, result.value);
    if (isPromiseLike(reduced)) {
      return foldStepAsyncFromReduce(input, reduced);
    }
    state = reduced;
    result = step.next();
  }
  return foldStepAsyncFromNext(input, state, result);
};

const appendStepItem = <T>(items: T[], item: T) => {
  items.push(item);
  return items;
};

export const collectStep = <T>(step: Step<T>): MaybePromise<T[]> =>
  foldStep(appendStepItem<T>, [], step);

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

export const maybeMap = <TIn, TOut>(
  map: Mapper<TIn, TOut>,
  value: MaybePromise<TIn>,
): MaybePromise<TOut> => maybeMapWith(map, value);

export const maybeChain = <TIn, TOut>(
  next: MaybeHandler<TIn, TOut>,
  value: MaybePromise<TIn>,
): MaybePromise<TOut> => maybeChainWith(next, value);

export const maybeAll = pipelineMaybeAll;

export const maybeReduce = <TState, TValue>(
  reduce: MaybeReducer<TState, TValue>,
  initial: TState,
  values: readonly TValue[],
): MaybePromise<TState> => {
  return foldStep(reduce, initial, toStep(values));
};

export const maybeTap = <TIn>(
  tap: (value: TIn) => MaybePromise<unknown>,
  value: MaybePromise<TIn>,
): MaybePromise<TIn> => maybeTapWith(tap, value);

export const maybeTry = <T>(onError: ErrorHandler<T>, run: MaybeThunk<T>): MaybePromise<T> =>
  maybeTryWith(onError, run);

export const maybeMapArray = <TIn, TOut>(
  map: (value: TIn) => TOut,
  value: MaybePromise<TIn[]>,
): MaybePromise<TOut[]> => maybeMapArrayWith(map, value);

export const maybeMapOr = <TIn, TOut>(
  map: MaybeHandler<TIn, TOut>,
  fallback: () => MaybePromise<TOut>,
  value: MaybePromise<TIn | null | undefined>,
): MaybePromise<TOut> => maybeMapOrWith(map, fallback, value);

export { bindFirst } from "./fp";
