import { isJsonValue, type JsonValue } from "#contracts";

const SENSITIVE_KEYS = new Set([
  "apikey",
  "authorization",
  "clientsecret",
  "cookie",
  "credential",
  "filepath",
  "localpath",
  "password",
  "path",
  "privatekey",
  "providermetadata",
  "secret",
  "signedurl",
  "skillpath",
  "token",
]);
const URL = /^[a-z][a-z\d+.-]*:\/\//i;
const PATH = /^(?:\/|~\/|\.{1,2}\/|[A-Za-z]:[\\/]|\\\\|file:)/;
const CREDENTIAL =
  /^(?:bearer\s+|basic\s+|sk-[a-z0-9]|ghp_|github_pat_|xox[baprs]-|AKIA[0-9A-Z]{12}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;

const normalizedKey = (key: string): string => key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();

const isSensitiveKey = (key: string): boolean => {
  const normalized = normalizedKey(key);
  return [...SENSITIVE_KEYS].some((sensitive) => normalized.includes(sensitive));
};

export const safeAdapterScalar = (value: unknown): string => {
  if (typeof value !== "string" || URL.test(value) || PATH.test(value) || CREDENTIAL.test(value)) {
    return "[redacted]";
  }
  return value;
};

const sanitizeValue = (value: unknown, ancestors: Set<object>): JsonValue => {
  if (typeof value === "string") {
    return safeAdapterScalar(value);
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (typeof value !== "object" || ancestors.has(value)) {
    return null;
  }
  ancestors.add(value);
  const sanitized: JsonValue = Array.isArray(value)
    ? value.map((child) => sanitizeValue(child, ancestors))
    : Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          isSensitiveKey(key) ? "[redacted]" : sanitizeValue(child, ancestors),
        ]),
      );
  ancestors.delete(value);
  return sanitized;
};

export const sanitizeAdapterMetadata = (value: unknown): JsonValue => {
  const sanitized = sanitizeValue(value, new Set<object>());
  if (!isJsonValue(sanitized)) {
    throw new TypeError("Native metadata could not be safely projected.");
  }
  return sanitized;
};
