import {
  isCanonicalUuid,
  isDigest,
  isExternalId,
  isJsonValue,
  type JsonObject,
  type JsonValue,
  type ResourceRef,
  type SecretRef,
} from "#contracts";
import {
  cloneFrozen as frozenClone,
  hasOnlyKeys,
  isPortableRecord as isPlainRecord,
} from "#shared/portable-data";
import type { CacheRecord, StorageValue } from "./types";

const MEDIA_TYPE_PATTERN =
  // eslint-disable-next-line sonarjs/regex-complexity -- mirrors ADR-003's accepted media type syntax
  /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:\s*;\s*[A-Za-z0-9!#$&^_.+-]+=(?:[A-Za-z0-9!#$&^_.+-]+|"[^"]*"))*$/;
const CANONICAL_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const SENSITIVE_KEY_STEMS = [
  "apikey",
  "authorization",
  "clientsecret",
  "cookie",
  "credential",
  "password",
  "path",
  "privatekey",
  "providermetadata",
  "secret",
  "signedurl",
  "token",
] as const;
const CREDENTIAL_VALUE_PATTERN =
  /^(?:bearer\s+|basic\s+|sk-[a-z0-9]|ghp_|github_pat_|xox[baprs]-|AKIA[0-9a-z]{12}|-----BEGIN [a-z ]*PRIVATE KEY-----)/i;
const PATH_VALUE_PATTERN = /^(?:\/|~\/|\.{1,2}\/|[A-Za-z]:[\\/]|\\\\|file:)/;
const SIGNED_URL_PARAMETER_PATTERN =
  /[?&](?:access_token|api[_-]?key|credential|signature|signed|token|x-amz-signature)=/i;

const normalizedKey = (key: string): string => key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();

export const isSensitivePortableKey = (key: string): boolean => {
  const normalized = normalizedKey(key);
  return SENSITIVE_KEY_STEMS.some((stem) => normalized.includes(stem));
};

export const isSensitivePortableString = (value: string): boolean =>
  CREDENTIAL_VALUE_PATTERN.test(value) ||
  PATH_VALUE_PATTERN.test(value) ||
  SIGNED_URL_PARAMETER_PATTERN.test(value);

const isSecretRef = (value: unknown): value is SecretRef =>
  isPlainRecord(value) && hasOnlyKeys(value, ["secretId"]) && isExternalId(value.secretId);

const isOpaqueReferenceLookalike = (value: Record<string, unknown>): boolean =>
  Object.hasOwn(value, "secretId") || Object.hasOwn(value, "resourceId");

const hasSafePortableJson = (value: JsonValue): boolean => {
  if (typeof value === "string") {
    return !isSensitivePortableString(value);
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(hasSafePortableJson);
  }
  if (isSecretRef(value) || isResourceRef(value)) {
    return true;
  }
  if (isOpaqueReferenceLookalike(value)) {
    return false;
  }
  return Object.entries(value).every(
    ([key, child]) => !isSensitivePortableKey(key) && hasSafePortableJson(child),
  );
};

export const isPortableJsonValue = (value: unknown): value is JsonValue =>
  isJsonValue(value) && hasSafePortableJson(value);

export const registerPortableJsonValue = (value: unknown): JsonValue => {
  if (!isPortableJsonValue(value)) {
    throw new TypeError(
      "Portable JSON cannot contain credentials, physical paths, signed URLs or provider metadata.",
    );
  }
  return frozenClone(value);
};

export const registerPortableJsonObject = (value: unknown): JsonObject => {
  const registered = registerPortableJsonValue(value);
  if (registered === null || Array.isArray(registered) || typeof registered !== "object") {
    throw new TypeError("Portable JSON objects must be closed JSON records.");
  }
  return registered;
};

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
    return hasOnlyKeys(value, ["kind", "value"]) && isPortableJsonValue(value.value);
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
  registerStorageValue({ kind: "json", value: registerPortableJsonValue(value) });

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
