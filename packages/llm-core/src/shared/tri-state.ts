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
