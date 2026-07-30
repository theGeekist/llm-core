import { isDigest } from "#contracts";
import type { Digest, JsonValue } from "#contracts";
import { maybeMap, type MaybePromise } from "#shared/maybe";
import { canonicalizeJson, freezeJsonValue, normalizeStrictJson } from "./canonical-json";

declare const registeredToolSchemaBrand: unique symbol;

const registeredToolSchemas = new WeakSet<object>();

export interface ToolSchemaDigestPort {
  /** SHA-256 over the exact UTF-8 bytes of `canonicalSchema`. */
  digest(canonicalSchema: string): MaybePromise<Digest>;
}

export interface RegisteredToolSchema {
  document: JsonValue;
  digest: Digest;
  readonly [registeredToolSchemaBrand]: "RegisteredToolSchema";
}

/**
 * Runtime provenance check for schemas admitted through `registerToolSchema`.
 *
 * The TypeScript brand alone is erased at runtime. Keep this check
 * feature-local so callers cannot forge a document/digest pair with a cast or
 * from plain JavaScript.
 */
export const isRegisteredToolSchema = (value: unknown): value is RegisteredToolSchema =>
  typeof value === "object" && value !== null && registeredToolSchemas.has(value);

const snapshotSchemaDigest = (value: unknown): Readonly<Digest> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Tool schema digest ports must return a canonical SHA-256 digest.");
  }

  let descriptors: PropertyDescriptorMap;
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw new TypeError("Tool schema digest ports must return a canonical SHA-256 digest.");
  }

  const keys = Reflect.ownKeys(descriptors);
  const algorithm = descriptors.algorithm;
  const digestValue = descriptors.value;
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    keys.length !== 2 ||
    !keys.includes("algorithm") ||
    !keys.includes("value") ||
    algorithm === undefined ||
    digestValue === undefined ||
    algorithm.enumerable !== true ||
    digestValue.enumerable !== true ||
    !("value" in algorithm) ||
    !("value" in digestValue)
  ) {
    throw new TypeError("Tool schema digest ports must return a canonical SHA-256 digest.");
  }

  const snapshot = {
    algorithm: algorithm.value,
    value: digestValue.value,
  };
  if (!isDigest(snapshot)) {
    throw new TypeError("Tool schema digest ports must return a canonical SHA-256 digest.");
  }
  return Object.freeze(snapshot);
};

export const registerToolSchema = (
  document: unknown,
  port: ToolSchemaDigestPort,
): MaybePromise<RegisteredToolSchema> => {
  const normalized = normalizeStrictJson(document);
  const canonicalSchema = canonicalizeJson(normalized);
  return maybeMap((value) => {
    const registered = {
      document: freezeJsonValue(normalized),
      digest: snapshotSchemaDigest(value),
    } as RegisteredToolSchema;
    registeredToolSchemas.add(registered);
    return Object.freeze(registered);
  }, port.digest(canonicalSchema));
};
