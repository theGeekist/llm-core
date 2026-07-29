import type { JsonArray, JsonObject, JsonValue } from "#contracts";

const invalidJson = (reason: string): never => {
  throw new TypeError(`Value is not strict JSON: ${reason}.`);
};

const assertUnicodeScalarString = (value: string, location: string): void => {
  let index = 0;
  while (index < value.length) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        invalidJson(`lone high surrogate in ${location}`);
      }
      index += 2;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      invalidJson(`lone low surrogate in ${location}`);
    }
    index += 1;
  }
};

const normalizeNumber = (value: number): number => {
  if (!Number.isFinite(value)) {
    return invalidJson("non-finite number");
  }
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
    return invalidJson("unsafe integer");
  }
  return Object.is(value, -0) ? 0 : value;
};

const isPlainRecord = (value: object): value is Record<string, unknown> => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const readDataProperty = (
  descriptor: PropertyDescriptor | undefined,
  location: string,
): unknown => {
  if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
    return invalidJson(`non-data property at ${location}`);
  }
  return descriptor.value;
};

const normalizeArray = (value: unknown[], ancestors: Set<object>): JsonArray => {
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === "symbol")) {
    return invalidJson("symbol-keyed array property");
  }
  const allowedKeys = new Set(["length", ...value.map((_, index) => String(index))]);
  if (ownKeys.some((key) => typeof key === "string" && !allowedKeys.has(key))) {
    return invalidJson("non-index array property");
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const normalized: JsonArray = [];
  for (let index = 0; index < value.length; index += 1) {
    normalized.push(
      normalizeJson(
        readDataProperty(descriptors[String(index)], `array index ${index}`),
        ancestors,
      ),
    );
  }
  return normalized;
};

const normalizeObject = (value: Record<string, unknown>, ancestors: Set<object>): JsonObject => {
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === "symbol")) {
    return invalidJson("symbol-keyed object property");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const normalized: JsonObject = {};
  const keys = (ownKeys as string[]).sort();
  for (const key of keys) {
    assertUnicodeScalarString(key, "object key");
    normalized[key] = normalizeJson(
      readDataProperty(descriptors[key], `object property ${key}`),
      ancestors,
    );
  }
  return normalized;
};

const normalizeJson = (value: unknown, ancestors: Set<object>): JsonValue => {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    assertUnicodeScalarString(value, "string value");
    return value;
  }
  if (typeof value === "number") {
    return normalizeNumber(value);
  }
  if (typeof value !== "object") {
    return invalidJson(typeof value);
  }
  if (ancestors.has(value)) {
    return invalidJson("cyclic reference");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return normalizeArray(value, ancestors);
    }
    if (!isPlainRecord(value)) {
      return invalidJson("non-plain object");
    }
    return normalizeObject(value, ancestors);
  } finally {
    ancestors.delete(value);
  }
};

const serializeCanonical = (value: JsonValue): string => {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeCanonical).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${serializeCanonical(value[key] as JsonValue)}`)
    .join(",")}}`;
};

export const normalizeStrictJson = (value: unknown): JsonValue =>
  normalizeJson(value, new Set<object>());

export const freezeJsonValue = (value: JsonValue): JsonValue => {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    value.forEach(freezeJsonValue);
  } else {
    Object.values(value).forEach(freezeJsonValue);
  }
  return Object.freeze(value) as JsonValue;
};

/**
 * Produces an RFC 8785 JCS-compatible representation after enforcing the
 * narrower llm-core number and plain-data rules.
 */
export const canonicalizeJson = (value: unknown): string =>
  serializeCanonical(normalizeStrictJson(value));
