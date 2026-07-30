import { isPortableRecord, type PortableRecord } from "./portable-data";

export type RecordValue = PortableRecord;

export const isRecord = isPortableRecord;

export const hasKeys = (value: RecordValue) => Object.keys(value).length > 0;

export const isString = (value: unknown): value is string => typeof value === "string";

export const isArray = Array.isArray as (value: unknown) => value is unknown[];

export const isNull = (value: unknown): value is null => value === null;

export const isNonEmptyArray = <T>(
  value: unknown,
  isT?: (item: unknown) => item is T,
): value is [T, ...T[]] => Array.isArray(value) && value.length > 0 && (!isT || value.every(isT));
