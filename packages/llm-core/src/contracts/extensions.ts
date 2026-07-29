declare const extensionNamespaceBrand: unique symbol;

export type JsonPrimitive = boolean | null | number | string;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

/**
 * @pattern ^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$
 */
export type ExtensionNamespace = string & {
  readonly [extensionNamespaceBrand]: "ExtensionNamespace";
};

export type NativeExtensions = Record<string, JsonValue>;

export const EXTENSION_NAMESPACE_PATTERN =
  "^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$";

const REVERSE_DNS_PATTERN = new RegExp(EXTENSION_NAMESPACE_PATTERN);

export const isExtensionNamespace = (value: unknown): value is ExtensionNamespace =>
  typeof value === "string" && REVERSE_DNS_PATTERN.test(value);

export function extensionNamespace(value: string): ExtensionNamespace {
  if (!isExtensionNamespace(value)) {
    throw new TypeError("Extension namespaces must use lowercase reverse-DNS notation.");
  }
  return value;
}

const isJsonObject = (value: object) => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const inspectJsonValue = (value: unknown, ancestors: Set<object>): value is JsonValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (typeof value !== "object" || ancestors.has(value)) {
    return false;
  }

  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => inspectJsonValue(item, ancestors))
    : isJsonObject(value) &&
      Object.values(value).every((item) => inspectJsonValue(item, ancestors));
  ancestors.delete(value);
  return valid;
};

export const isJsonValue = (value: unknown): value is JsonValue =>
  inspectJsonValue(value, new Set<object>());

export const isNativeExtensions = (value: unknown): value is NativeExtensions => {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !isJsonObject(value)) {
    return false;
  }
  return Object.entries(value).every(
    ([namespace, extension]) => isExtensionNamespace(namespace) && isJsonValue(extension),
  );
};

export function nativeExtensions(value: Record<string, unknown>): NativeExtensions {
  if (!isNativeExtensions(value)) {
    throw new TypeError(
      "Native extensions require reverse-DNS namespaces and JSON-compatible values.",
    );
  }
  return value;
}
