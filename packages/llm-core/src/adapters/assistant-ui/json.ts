import type { ReadonlyJSONValue } from "assistant-stream/utils";

type NonJsonReason =
  | "bigint"
  | "circular"
  | "error"
  | "function"
  | "non-finite-number"
  | "unsupported";

type NonJsonValue = {
  reason: NonJsonReason;
  message: string;
};

export type AssistantUiJsonFallback = {
  readonly type: "llm-core.non-json-value";
  readonly reason: NonJsonReason;
  readonly message: string;
};

const unsupported = (value: unknown): NonJsonValue => ({
  reason: "unsupported",
  message: typeof value,
});

function inspectJsonObject(value: object, ancestors: Set<object>): NonJsonValue | null {
  if (ancestors.has(value)) {
    return { reason: "circular", message: "Circular reference" };
  }
  ancestors.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
      return unsupported(value);
    }
    const values = Array.isArray(value) ? value : Object.values(value);
    for (const item of values) {
      const invalid = inspectJsonValue(item, ancestors);
      if (invalid) {
        return invalid;
      }
    }
    return null;
  } catch {
    return unsupported(value);
  } finally {
    ancestors.delete(value);
  }
}

function inspectJsonValue(value: unknown, ancestors: Set<object>): NonJsonValue | null {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? null : { reason: "non-finite-number", message: String(value) };
  }
  if (typeof value === "bigint") {
    return { reason: "bigint", message: value.toString() };
  }
  if (typeof value === "function") {
    return { reason: "function", message: value.name || "anonymous" };
  }
  if (value instanceof Error) {
    return { reason: "error", message: value.message };
  }
  if (typeof value !== "object") {
    return unsupported(value);
  }
  return inspectJsonObject(value, ancestors);
}

const toFallback = (invalid: NonJsonValue): AssistantUiJsonFallback => ({
  type: "llm-core.non-json-value",
  reason: invalid.reason,
  message: invalid.message,
});

export const toAssistantUiJsonValue = (value: unknown): ReadonlyJSONValue => {
  const invalid = inspectJsonValue(value, new Set<object>());
  return invalid ? toFallback(invalid) : (value as ReadonlyJSONValue);
};
