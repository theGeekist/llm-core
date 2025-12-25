import {
  isPromiseLike,
  maybeAll,
  maybeThen,
  maybeTry,
  composeK,
  processSequentially,
} from "@wpkernel/pipeline/core/async-utils";
import type { MaybePromise } from "@wpkernel/pipeline/core";

type MaybeThunk<T> = { (): MaybePromise<T> };
type MaybeHandler<TIn, TOut> = { (value: TIn): MaybePromise<TOut> };
type ErrorHandler<T> = { (error: unknown): MaybePromise<T> };
type MaybeBinary<TFirst, TSecond, TResult> = {
  (first: TFirst, second: TSecond): MaybePromise<TResult>;
};

export { isPromiseLike, maybeAll, maybeThen, maybeTry, composeK, processSequentially };

export type { MaybePromise };

export function chainMaybe<TIn, TOut>(value: MaybePromise<TIn>, next: MaybeHandler<TIn, TOut>) {
  return maybeThen(value, next);
}

export function tryMaybe<T>(fn: MaybeThunk<T>, onError: ErrorHandler<T>) {
  return maybeTry(fn, onError);
}

export function mapMaybe<TIn, TOut>(
  value: MaybePromise<TIn>,
  map: (value: TIn) => MaybePromise<TOut>,
) {
  return maybeThen(value, map);
}

export function fromPromiseLike<T>(value: T | PromiseLike<T>): MaybePromise<T> {
  if (isPromiseLike(value)) {
    return Promise.resolve(value);
  }
  return value;
}

export function mapMaybeArray<TIn, TOut>(value: MaybePromise<TIn[]>, map: (value: TIn) => TOut) {
  return mapMaybe(value, (items) => items.map(map));
}

export function mapMaybeOr<TIn, TOut>(
  value: MaybePromise<TIn | undefined>,
  map: (value: TIn) => MaybePromise<TOut>,
  fallback: () => MaybePromise<TOut>,
) {
  if (isPromiseLike(value)) {
    return maybeThen(value, (inner) => (inner === undefined ? fallback() : map(inner)));
  }
  if (value === undefined) {
    return fallback();
  }
  return map(value);
}

export function tapMaybe<TIn>(value: MaybePromise<TIn>, tap: (value: TIn) => MaybePromise<void>) {
  return mapMaybe(value, (result) => chainMaybe(tap(result), () => result));
}

export function partialK<TFirst, TSecond, TResult>(
  fn: MaybeBinary<TFirst, TSecond, TResult>,
  first: TFirst,
) {
  return (second: TSecond) => fn(first, second);
}

export function curryK<TFirst, TSecond, TResult>(fn: MaybeBinary<TFirst, TSecond, TResult>) {
  return (first: TFirst) => (second: TSecond) => fn(first, second);
}

export function identity<T>(value: T) {
  return value;
}

export function bindFirst<TFirst, TRest extends unknown[], TResult>(
  fn: (first: TFirst, ...rest: TRest) => TResult,
  first: TFirst,
) {
  return (...rest: TRest) => fn(first, ...rest);
}
