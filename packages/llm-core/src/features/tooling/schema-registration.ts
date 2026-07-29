import { isDigest } from "#contracts";
import type { Digest, JsonValue } from "#contracts";
import { maybeMap, type MaybePromise } from "#shared/maybe";
import { canonicalizeJson, freezeJsonValue, normalizeStrictJson } from "./canonical-json";

declare const registeredToolSchemaBrand: unique symbol;

export interface ToolSchemaDigestPort {
  /** SHA-256 over the exact UTF-8 bytes of `canonicalSchema`. */
  digest(canonicalSchema: string): MaybePromise<Digest>;
}

export interface RegisteredToolSchema {
  document: JsonValue;
  digest: Digest;
  readonly [registeredToolSchemaBrand]: "RegisteredToolSchema";
}

const assertSchemaDigest = (value: Digest): Digest => {
  if (!isDigest(value)) {
    throw new TypeError("Tool schema digest ports must return a canonical SHA-256 digest.");
  }
  return value;
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
      digest: Object.freeze({ ...assertSchemaDigest(value) }),
    } as RegisteredToolSchema;
    return Object.freeze(registered);
  }, port.digest(canonicalSchema));
};
