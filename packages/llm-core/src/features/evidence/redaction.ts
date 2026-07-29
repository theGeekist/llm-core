import { isNativeExtensions, type JsonValue, type NativeExtensions } from "#contracts";

declare const redactedNativeExtensionsBrand: unique symbol;

/**
 * Sensitive categories that may be removed from a receipt or event projection.
 */
export type RedactionCategory =
  | "arguments"
  | "credentials"
  | "native-payload"
  | "personal-data"
  | "result";

/**
 * Explicit redaction posture for portable receipts and canonical events.
 *
 * The metadata intentionally records categories rather than field paths or
 * removed values, either of which could disclose sensitive structure.
 */
export type RedactionMetadata =
  | {
      kind: "not-required";
    }
  | {
      kind: "redacted";
      categories: RedactionCategory[];
    }
  | {
      kind: "evidence-only";
      categories: RedactionCategory[];
    };

/**
 * Native extension facts that crossed an explicit redaction boundary.
 *
 * The brand prevents an arbitrary `NativeExtensions` value from being attached
 * directly to a portable receipt or event. Hosts remain responsible for
 * replacing sensitive values before calling `redactedNativeExtensions`.
 */
export type RedactedNativeExtensions = NativeExtensions & {
  readonly [redactedNativeExtensionsBrand]: "RedactedNativeExtensions";
};

const SENSITIVE_EXTENSION_KEY_PARTS = [
  "argument",
  "authorization",
  "credential",
  "nativepayload",
  "password",
  "providerpayload",
  "result",
  "secret",
  "token",
];

const isSensitiveExtensionKey = (key: string): boolean => {
  const normalized = key.replaceAll(/[-_ ]/g, "").toLowerCase();
  return SENSITIVE_EXTENSION_KEY_PARTS.some((part) => normalized.includes(part));
};

const containsSensitiveKey = (value: JsonValue): boolean => {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(containsSensitiveKey);
  }
  return Object.entries(value).some(
    ([key, child]) => isSensitiveExtensionKey(key) || containsSensitiveKey(child),
  );
};

/**
 * Marks already-redacted reverse-DNS extensions as safe for projection.
 *
 * Obvious sensitive field names are rejected as a guardrail; callers must
 * still redact opaque string values because their semantics are unknowable.
 */
export function redactedNativeExtensions(value: Record<string, unknown>): RedactedNativeExtensions {
  if (!isNativeExtensions(value)) {
    throw new TypeError(
      "Redacted native extensions require reverse-DNS namespaces and JSON-compatible values.",
    );
  }
  if (Object.values(value).some(containsSensitiveKey)) {
    throw new TypeError(
      "Receipt and event extensions cannot contain sensitive or raw payload fields.",
    );
  }
  return value as RedactedNativeExtensions;
}
