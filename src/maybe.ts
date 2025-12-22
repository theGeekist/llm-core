import {
  isPromiseLike,
  maybeAll,
  maybeThen,
  maybeTry,
  composeK,
  processSequentially,
  type MaybePromise,
} from "@wpkernel/pipeline/core";

type MaybeThunk<T> = { (): MaybePromise<T> };
type MaybeHandler<TIn, TOut> = { (value: TIn): MaybePromise<TOut> };
type ErrorHandler<T> = { (error: unknown): MaybePromise<T> };

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

export function mapMaybeArray<TIn, TOut>(value: MaybePromise<TIn[]>, map: (value: TIn) => TOut) {
  return mapMaybe(value, (items) => items.map(map));
}

export function identity<T>(value: T) {
  return value;
}
