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

const isEnumerableDataDescriptor = (
  descriptor: PropertyDescriptor | undefined,
): descriptor is PropertyDescriptor & { value: unknown } =>
  descriptor !== undefined && descriptor.enumerable === true && "value" in descriptor;

const inspectJsonArray = (value: unknown[], ancestors: Set<object>): boolean => {
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === "symbol")) {
    return false;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    lengthDescriptor.enumerable !== false ||
    typeof lengthDescriptor.value !== "number"
  ) {
    return false;
  }

  const length = lengthDescriptor.value;
  if (ownKeys.length !== length + 1) {
    return false;
  }

  return ownKeys.every((key) => {
    if (key === "length") {
      return true;
    }
    if (typeof key !== "string" || !/^(?:0|[1-9]\d*)$/.test(key)) {
      return false;
    }
    const index = Number(key);
    return (
      Number.isSafeInteger(index) &&
      index < length &&
      isEnumerableDataDescriptor(descriptors[key]) &&
      inspectJsonValue(descriptors[key].value, ancestors)
    );
  });
};

const inspectJsonObject = (value: object, ancestors: Set<object>): boolean => {
  if (!isJsonObject(value)) {
    return false;
  }

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === "symbol")) {
    return false;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  return ownKeys.every(
    (key) =>
      typeof key === "string" &&
      isEnumerableDataDescriptor(descriptors[key]) &&
      inspectJsonValue(descriptors[key].value, ancestors),
  );
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
  try {
    return Array.isArray(value)
      ? inspectJsonArray(value, ancestors)
      : inspectJsonObject(value, ancestors);
  } finally {
    ancestors.delete(value);
  }
};

export const isJsonValue = (value: unknown): value is JsonValue => {
  try {
    if (!inspectJsonValue(value, new Set<object>())) {
      return false;
    }

    // Descriptor traversal alone cannot distinguish an ordinary object from a
    // Proxy whose traps present safe descriptors but return different values
    // through property reads. Structured cloning rejects proxies without
    // invoking their `get` traps; validating the detached result also ensures
    // the accepted graph survives the snapshot boundary as strict JSON data.
    const clone = (
      globalThis as unknown as {
        readonly structuredClone?: (input: unknown) => unknown;
      }
    ).structuredClone;
    if (clone === undefined) {
      return false;
    }
    const snapshot: unknown = clone(value);
    return inspectJsonValue(snapshot, new Set<object>());
  } catch {
    return false;
  }
};

export const isNativeExtensions = (value: unknown): value is NativeExtensions => {
  try {
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      isJsonValue(value) &&
      Reflect.ownKeys(value).every(
        (namespace) => typeof namespace === "string" && isExtensionNamespace(namespace),
      )
    );
  } catch {
    return false;
  }
};

export function nativeExtensions(value: Record<string, unknown>): NativeExtensions {
  if (!isNativeExtensions(value)) {
    throw new TypeError(
      "Native extensions require reverse-DNS namespaces and JSON-compatible values.",
    );
  }
  return value;
}
