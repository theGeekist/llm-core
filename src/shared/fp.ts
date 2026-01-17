export function identity<T>(value: T) {
  return value;
}

export const toNull = () => null;
export const toUndefined = () => undefined; // strongly discouraged. Only used for interop adapters
export const toTrue = () => true;
export const toFalse = () => false;
export const isNull = (value: unknown): value is null => value === null;
export const isFalse = (value: unknown): value is false => value === false;

export const toArray = (value: string | string[]) => (Array.isArray(value) ? value : [value]);

export const mapArray = <TIn, TOut>(map: (value: TIn) => TOut, items: readonly TIn[]) =>
  items.map(map);

export type Unary<TIn, TOut> = (value: TIn) => TOut;

const applyCompose = (fns: readonly Unary<unknown, unknown>[], value: unknown) => {
  let result = value;
  for (let index = fns.length - 1; index >= 0; index -= 1) {
    const fn = fns[index];
    if (!fn) {
      continue;
    }
    result = fn(result);
  }
  return result;
};

export function compose<TIn, TOut>(fn: Unary<TIn, TOut>): (value: TIn) => TOut;
export function compose<TIn, TMid, TOut>(
  fn1: Unary<TMid, TOut>,
  fn2: Unary<TIn, TMid>,
): (value: TIn) => TOut;
export function compose<TIn, TMid, TMid2, TOut>(
  fn1: Unary<TMid2, TOut>,
  fn2: Unary<TMid, TMid2>,
  fn3: Unary<TIn, TMid>,
): (value: TIn) => TOut;
export function compose<TIn, TMid, TMid2, TMid3, TOut>(
  fn1: Unary<TMid3, TOut>,
  fn2: Unary<TMid2, TMid3>,
  fn3: Unary<TMid, TMid2>,
  fn4: Unary<TIn, TMid>,
): (value: TIn) => TOut;
export function compose(...fns: Array<Unary<unknown, unknown>>) {
  return bindFirst(applyCompose, fns);
}

/**
 * Binds a function to undefined context.
 * Unsafe for methods relying on `this`.
 */
export const bindUnsafe = (fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
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

// Generic partial application for binary functions
export type Binary<TFirst, TSecond, TResult> = {
  (first: TFirst, second: TSecond): TResult;
};

const partialKWith = <TFirst, TSecond, TResult>(
  fn: Binary<TFirst, TSecond, TResult>,
  first: TFirst,
) => bindUnsafe(fn as (...args: unknown[]) => unknown, first) as (second: TSecond) => TResult;

const partialKFactory = <TFirst, TSecond, TResult>(fn: Binary<TFirst, TSecond, TResult>) =>
  bindUnsafe(partialKWith as (...args: unknown[]) => unknown, fn) as (
    first: TFirst,
  ) => (second: TSecond) => TResult;

export function partialK<TFirst, TSecond, TResult>(
  fn: Binary<TFirst, TSecond, TResult>,
  first: TFirst,
): (second: TSecond) => TResult;
export function partialK<TFirst, TSecond, TResult>(
  fn: Binary<TFirst, TSecond, TResult>,
): (first: TFirst) => (second: TSecond) => TResult;
export function partialK<TFirst, TSecond, TResult>(
  fn: Binary<TFirst, TSecond, TResult>,
  first?: TFirst,
) {
  if (arguments.length === 1) {
    return partialKFactory(fn);
  }
  return partialKWith(fn, first as TFirst);
}

const curryKApply = <TFirst, TSecond, TResult>(
  fn: Binary<TFirst, TSecond, TResult>,
  first: TFirst,
  second: TSecond,
) => fn(first, second);

const curryKWith = <TFirst, TSecond, TResult>(
  fn: Binary<TFirst, TSecond, TResult>,
  first: TFirst,
) =>
  bindUnsafe(curryKApply as (...args: unknown[]) => unknown, fn, first) as (
    second: TSecond,
  ) => TResult;

const curryKFactory = <TFirst, TSecond, TResult>(fn: Binary<TFirst, TSecond, TResult>) =>
  bindUnsafe(curryKWith as (...args: unknown[]) => unknown, fn) as (
    first: TFirst,
  ) => (second: TSecond) => TResult;

export function curryK<TFirst, TSecond, TResult>(
  fn: Binary<TFirst, TSecond, TResult>,
  first: TFirst,
  second: TSecond,
): TResult;
export function curryK<TFirst, TSecond, TResult>(
  fn: Binary<TFirst, TSecond, TResult>,
  first: TFirst,
): (second: TSecond) => TResult;
export function curryK<TFirst, TSecond, TResult>(
  fn: Binary<TFirst, TSecond, TResult>,
): (first: TFirst) => (second: TSecond) => TResult;
export function curryK<TFirst, TSecond, TResult>(
  fn: Binary<TFirst, TSecond, TResult>,
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
