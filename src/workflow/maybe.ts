// References: docs/workflow-notes.md (MaybePromise dynamics)

import { maybeThen, maybeTry, type MaybePromise } from "@wpkernel/pipeline/core";

type MaybeThunk<T> = { (): MaybePromise<T> };
type MaybeHandler<TIn, TOut> = { (value: TIn): MaybePromise<TOut> };
type ErrorHandler<T> = { (error: unknown): MaybePromise<T> };

export function chainMaybe<TIn, TOut>(value: MaybePromise<TIn>, next: MaybeHandler<TIn, TOut>) {
  return maybeThen(value, next);
}

export function tryMaybe<T>(fn: MaybeThunk<T>, onError: ErrorHandler<T>) {
  return maybeTry(fn, onError);
}
