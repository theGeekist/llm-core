import { isJsonValue, type JsonValue } from "#contracts";

const SENSITIVE = new Set([
  "apikey",
  "authorization",
  "cookie",
  "credential",
  "localpath",
  "password",
  "path",
  "secret",
  "signedurl",
  "skillpath",
  "token",
]);
const URL = /^[a-z][a-z\d+.-]*:\/\//i;
const isSensitiveKey = (key: string): boolean =>
  SENSITIVE.has(key.replaceAll(/[-_]/g, "").toLowerCase());

export const sanitizeNativeMetadata = (value: unknown): JsonValue => {
  if (typeof value === "string") {
    return URL.test(value) ? "[redacted-url]" : value;
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeNativeMetadata);
  }
  if (typeof value === "object" && value !== null) {
    const projected: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(value)) {
      projected[key] = isSensitiveKey(key) ? "[redacted]" : sanitizeNativeMetadata(child);
    }
    return projected;
  }
  return null;
};

export const closedMetadata = (value: unknown): JsonValue => {
  const sanitized = sanitizeNativeMetadata(value);
  if (!isJsonValue(sanitized)) {
    throw new TypeError("Native metadata could not be safely projected.");
  }
  return sanitized;
};
