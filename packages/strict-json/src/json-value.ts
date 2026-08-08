export type JsonScalar = null | boolean | number | string;
export type JsonArray = JsonValue[];
export type JsonRecord = { [key: string]: JsonValue };
export type JsonValue = JsonScalar | JsonArray | JsonRecord;

export type FrozenJsonArray = readonly FrozenJsonValue[];
export type FrozenJsonRecord = { readonly [key: string]: FrozenJsonValue };
export type FrozenJsonValue = JsonScalar | FrozenJsonArray | FrozenJsonRecord;

export type DeepReadonlyJson<T extends JsonValue> = T extends JsonScalar
  ? T
  : T extends JsonArray
    ? readonly DeepReadonlyJson<T[number]>[]
    : T extends JsonRecord
      ? { readonly [Key in keyof T]: DeepReadonlyJson<T[Key]> }
      : never;

export type JsonPathSegment = number | string;

export type StrictJsonErrorCode =
  | "canonicalization-failed"
  | "cyclic-reference"
  | "inspection-failed"
  | "lone-surrogate"
  | "non-data-property"
  | "non-enumerable-property"
  | "non-finite-number"
  | "non-index-array-property"
  | "non-plain-object"
  | "sparse-array"
  | "symbol-key"
  | "unsafe-integer"
  | "unsupported-type";

const pointerSegment = (segment: JsonPathSegment): string =>
  String(segment).replaceAll("~", "~0").replaceAll("/", "~1");

const pointer = (path: readonly JsonPathSegment[]): string =>
  path.length === 0 ? "/" : `/${path.map(pointerSegment).join("/")}`;

export class StrictJsonError extends TypeError {
  readonly code: StrictJsonErrorCode;
  readonly path: readonly JsonPathSegment[];

  constructor(code: StrictJsonErrorCode, path: readonly JsonPathSegment[]) {
    super(`Strict JSON rejected: ${code} at ${pointer(path)}.`);
    this.name = "StrictJsonError";
    this.code = code;
    this.path = Object.freeze([...path]);
  }
}

const invalid = (code: StrictJsonErrorCode, path: readonly JsonPathSegment[]): never => {
  throw new StrictJsonError(code, path);
};

const assertUnicodeScalarString = (value: string, path: readonly JsonPathSegment[]): void => {
  let index = 0;
  while (index < value.length) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        invalid("lone-surrogate", path);
      }
      index += 2;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      invalid("lone-surrogate", path);
    }
    index += 1;
  }
};

const normalizeNumber = (value: number, path: readonly JsonPathSegment[]): number => {
  if (!Number.isFinite(value)) {
    return invalid("non-finite-number", path);
  }
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
    return invalid("unsafe-integer", path);
  }
  return Object.is(value, -0) ? 0 : value;
};

export const sortedStrings = (values: readonly string[]): string[] => {
  const sorted = new Array<string>(values.length);
  for (let index = 0; index < values.length; index += 1) {
    sorted[index] = values[index] as string;
  }
  for (let index = 1; index < sorted.length; index += 1) {
    const value = sorted[index] as string;
    let insertion = index - 1;
    while (insertion >= 0 && (sorted[insertion] as string) > value) {
      sorted[insertion + 1] = sorted[insertion] as string;
      insertion -= 1;
    }
    sorted[insertion + 1] = value;
  }
  return sorted;
};

const readDataProperty = (
  descriptor: PropertyDescriptor | undefined,
  path: readonly JsonPathSegment[],
): unknown => {
  if (!descriptor || !("value" in descriptor)) {
    return invalid("non-data-property", path);
  }
  if (!descriptor.enumerable) {
    return invalid("non-enumerable-property", path);
  }
  return descriptor.value;
};

const normalizeArray = (
  value: unknown[],
  ancestors: Set<object>,
  path: readonly JsonPathSegment[],
): JsonArray => {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    return invalid("non-plain-object", path);
  }
  const ownKeys = Reflect.ownKeys(value);
  for (let index = 0; index < ownKeys.length; index += 1) {
    if (typeof ownKeys[index] === "symbol") return invalid("symbol-key", path);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !("value" in lengthDescriptor)) {
    return invalid("non-data-property", path);
  }
  const length = lengthDescriptor.value as number;
  const allowedKeys = new Set<string>(["length"]);
  for (let index = 0; index < length; index += 1) {
    allowedKeys.add(String(index));
  }
  for (let index = 0; index < ownKeys.length; index += 1) {
    if (!allowedKeys.has(ownKeys[index] as string)) {
      return invalid("non-index-array-property", path);
    }
  }
  const normalized: JsonArray = new Array(length);
  for (let index = 0; index < length; index += 1) {
    const at = [...path, index];
    const descriptor = descriptors[String(index)];
    if (!descriptor) {
      return invalid("sparse-array", at);
    }
    normalized[index] = normalizeValue(readDataProperty(descriptor, at), ancestors, at);
  }
  return normalized;
};

const normalizeRecord = (
  value: Record<string, unknown>,
  ancestors: Set<object>,
  path: readonly JsonPathSegment[],
): JsonRecord => {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return invalid("non-plain-object", path);
  }
  const ownKeys = Reflect.ownKeys(value);
  for (let index = 0; index < ownKeys.length; index += 1) {
    if (typeof ownKeys[index] === "symbol") return invalid("symbol-key", path);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const normalized = Object.create(null) as JsonRecord;
  for (const key of sortedStrings(ownKeys as string[])) {
    const at = [...path, key];
    assertUnicodeScalarString(key, at);
    const child = normalizeValue(readDataProperty(descriptors[key], at), ancestors, at);
    Object.defineProperty(normalized, key, {
      configurable: true,
      enumerable: true,
      value: child,
      writable: true,
    });
  }
  return normalized;
};

const normalizeValue = (
  value: unknown,
  ancestors: Set<object>,
  path: readonly JsonPathSegment[],
): JsonValue => {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    assertUnicodeScalarString(value, path);
    return value;
  }
  if (typeof value === "number") {
    return normalizeNumber(value, path);
  }
  if (typeof value !== "object") {
    return invalid("unsupported-type", path);
  }
  if (ancestors.has(value)) {
    return invalid("cyclic-reference", path);
  }
  ancestors.add(value);
  try {
    return Array.isArray(value)
      ? normalizeArray(value, ancestors, path)
      : normalizeRecord(value as Record<string, unknown>, ancestors, path);
  } finally {
    ancestors.delete(value);
  }
};

export const normalize = (value: unknown): JsonValue => {
  try {
    return normalizeValue(value, new Set<object>(), []);
  } catch (error) {
    if (error instanceof StrictJsonError) {
      throw error;
    }
    throw new StrictJsonError("inspection-failed", []);
  }
};

export const isRecord = (value: unknown): value is JsonRecord => {
  try {
    const normalized = normalize(value);
    return normalized !== null && typeof normalized === "object" && !Array.isArray(normalized);
  } catch {
    return false;
  }
};

export const hasExactKeys = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is JsonRecord => {
  try {
    if (!isRecord(value)) {
      return false;
    }
    const keys = Reflect.ownKeys(value) as string[];
    const allowed = new Set([...required, ...optional]);
    return required.every((key) => keys.includes(key)) && keys.every((key) => allowed.has(key));
  } catch {
    return false;
  }
};
