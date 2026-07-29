import { bindFirst } from "./fp";
import { maybeMap, maybeReduce, type MaybePromise } from "./maybe";

export type TriState = boolean | null;

export const normalizeTriState = (value: unknown): TriState =>
  value === null ? null : value !== false;

export const combineTriState = (previous: TriState, current: TriState): TriState => {
  if (previous === false || current === false) {
    return false;
  }
  if (previous === true || current === true) {
    return true;
  }
  return null;
};

export const combineTriStates = (values: TriState[]): TriState => {
  let result: TriState = null;
  for (const value of values) {
    result = combineTriState(result, value);
  }
  return result;
};

const reduceTriStateEffect = <T>(
  effect: (value: T) => MaybePromise<TriState>,
  previous: TriState,
  value: T,
) => maybeMap(bindFirst(combineTriState, previous), effect(value));

export const maybeReduceTriState = <T>(
  effect: (value: T) => MaybePromise<TriState>,
  values: readonly T[],
): MaybePromise<TriState> => maybeReduce(bindFirst(reduceTriStateEffect, effect), null, values);
