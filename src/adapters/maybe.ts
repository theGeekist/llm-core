import { maybeThen, type MaybePromise } from "@wpkernel/pipeline/core";

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
