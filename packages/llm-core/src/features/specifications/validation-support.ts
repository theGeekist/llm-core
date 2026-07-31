import { isExternalId, isNativeExtensions } from "#contracts";
import { hasOnlyKeys, isPortableRecord, type PortableRecord } from "#shared/portable-data";

export const fail = (message: string): never => {
  throw new TypeError(`Specification contracts require ${message}.`);
};

/* eslint-disable max-params -- closed-shape validation needs required and optional key lists. */
export const record = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
  message: string,
): PortableRecord => {
  if (!isPortableRecord(value) || !hasOnlyKeys(value, required, optional)) fail(message);
  return value as PortableRecord;
};
/* eslint-enable max-params */

export const valueOf = <T>(value: PortableRecord, key: string): T => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return undefined as T;
  if (!("value" in descriptor)) fail("closed data properties");
  return (descriptor as PropertyDescriptor & { value: T }).value;
};

export const nonBlankId = (value: unknown, message: string): string => {
  if (!isExternalId(value)) fail(message);
  return value as string;
};

export const nonBlankText = (value: unknown, message: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) fail(message);
  return value as string;
};

export const timestamp = (value: unknown, message: string): string => {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) fail(message);
  if (new Date(value as string).toISOString() !== value) fail(message);
  return value as string;
};

export const unique = (values: readonly string[], message: string): void => {
  if (new Set(values).size !== values.length) fail(message);
};

export const values = (value: unknown, message: string): readonly unknown[] => {
  if (!Array.isArray(value)) fail(message);
  return value as readonly unknown[];
};

export const optionalExtensions = (value: PortableRecord, key = "extensions"): void => {
  const extensions = valueOf<unknown>(value, key);
  if (extensions !== undefined && !isNativeExtensions(extensions)) {
    fail("strict JSON native extensions with reverse-DNS namespaces");
  }
};
