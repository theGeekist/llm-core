export type RecordValue = Record<string, unknown>;

export const isRecord = (value: unknown): value is RecordValue =>
  value !== null && typeof value === "object";

export const hasKeys = (value: RecordValue) => Object.keys(value).length > 0;

export const isString = (value: unknown): value is string => typeof value === "string";
