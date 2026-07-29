import {
  isCanonicalUuid,
  isDigest,
  isJsonValue,
  type JsonValue,
  type ResourceRef,
} from "#contracts";
import type { CacheRecord, StorageValue } from "./types";

const MEDIA_TYPE_PATTERN =
  // eslint-disable-next-line sonarjs/regex-complexity -- mirrors ADR-003's accepted media type syntax
  /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:\s*;\s*[A-Za-z0-9!#$&^_.+-]+=(?:[A-Za-z0-9!#$&^_.+-]+|"[^"]*"))*$/;
const CANONICAL_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasOnlyKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key))
  );
};

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
};

const frozenClone = <T>(value: T): T => deepFreeze(structuredClone(value));

export const isStorageKey = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 1024 && !/\s/.test(value);

export const assertStorageKey = (value: string): string => {
  if (!isStorageKey(value)) {
    throw new TypeError("Storage keys must contain 1–1024 non-whitespace characters.");
  }
  return value;
};

export const assertStorageKeys = (values: readonly string[]): readonly string[] => {
  if (values.length === 0 || !values.every(isStorageKey)) {
    throw new TypeError("Storage key collections must be non-empty and contain valid keys.");
  }
  return values;
};

export const isResourceRef = (value: unknown): value is ResourceRef =>
  isPlainRecord(value) &&
  hasOnlyKeys(value, ["resourceId", "mediaType", "byteLength", "digest"]) &&
  isCanonicalUuid(value.resourceId) &&
  typeof value.mediaType === "string" &&
  MEDIA_TYPE_PATTERN.test(value.mediaType) &&
  Number.isSafeInteger(value.byteLength) &&
  (value.byteLength as number) >= 0 &&
  isDigest(value.digest);

export const isStorageValue = (value: unknown): value is StorageValue => {
  if (!isPlainRecord(value) || typeof value.kind !== "string") {
    return false;
  }
  if (value.kind === "json") {
    return hasOnlyKeys(value, ["kind", "value"]) && isJsonValue(value.value);
  }
  return (
    value.kind === "resource" &&
    hasOnlyKeys(value, ["kind", "resource"]) &&
    isResourceRef(value.resource)
  );
};

export const registerStorageValue = (value: unknown): StorageValue => {
  if (!isStorageValue(value)) {
    throw new TypeError(
      "Storage values must be closed JSON values or storage-neutral resource references.",
    );
  }
  return frozenClone(value);
};

export const jsonStorageValue = (value: JsonValue): StorageValue =>
  registerStorageValue({ kind: "json", value });

export const resourceStorageValue = (resource: ResourceRef): StorageValue =>
  registerStorageValue({ kind: "resource", resource });

export const isCanonicalTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  CANONICAL_TIMESTAMP_PATTERN.test(value) &&
  !Number.isNaN(Date.parse(value));

export const isCacheRecord = (value: unknown): value is CacheRecord =>
  isPlainRecord(value) &&
  hasOnlyKeys(value, ["value"], ["expiresAt"]) &&
  isStorageValue(value.value) &&
  (value.expiresAt === undefined || isCanonicalTimestamp(value.expiresAt));

export const registerCacheRecord = (value: unknown): CacheRecord => {
  if (!isCacheRecord(value)) {
    throw new TypeError("Cache records must be closed portable values with canonical expiry.");
  }
  return frozenClone(value);
};
