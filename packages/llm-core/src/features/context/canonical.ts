import { createHash } from "node:crypto";
import {
  digest,
  isCanonicalUuid,
  isDigest,
  isJsonValue,
  isSchemaRef,
  type Digest,
  type EvidenceRef,
  type JsonArray,
  type JsonObject,
  type JsonValue,
  type PortableContent,
  type ResourceRef,
} from "#contracts";

const MEDIA_TYPE =
  // eslint-disable-next-line sonarjs/regex-complexity -- mirrors the canonical contract media type syntax
  /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:\s*;\s*[A-Za-z0-9!#$&^_.+-]+=(?:[A-Za-z0-9!#$&^_.+-]+|"[^"]*"))*$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const hasExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const keys = Reflect.ownKeys(value);
  return (
    keys.every(
      (key) =>
        typeof key === "string" &&
        (required.includes(key) || optional.includes(key)) &&
        Object.getOwnPropertyDescriptor(value, key)?.enumerable === true &&
        "value" in (Object.getOwnPropertyDescriptor(value, key) ?? {}),
    ) && required.every((key) => keys.includes(key))
  );
};

export const ownDataValue = (value: Record<string, unknown>, key: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor?.enumerable === true && "value" in descriptor ? descriptor.value : undefined;
};

export const isDenseArray = (value: readonly unknown[]): boolean => {
  const keys = Reflect.ownKeys(value);
  const indices = keys.filter((key) => key !== "length");
  return (
    indices.length === value.length &&
    indices.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return (
        typeof key === "string" &&
        /^(?:0|[1-9]\d*)$/.test(key) &&
        Number(key) < value.length &&
        descriptor?.enumerable === true &&
        "value" in descriptor
      );
    })
  );
};

const hasClosedJsonShape = (value: unknown): boolean => {
  if (value === null || ["boolean", "number", "string"].includes(typeof value)) return true;
  if (Array.isArray(value)) return isDenseArray(value) && value.every(hasClosedJsonShape);
  return (
    isPlainRecord(value) &&
    Reflect.ownKeys(value).every(
      (key) =>
        typeof key === "string" &&
        Object.getOwnPropertyDescriptor(value, key)?.enumerable === true &&
        "value" in (Object.getOwnPropertyDescriptor(value, key) ?? {}),
    ) &&
    Object.values(value).every(hasClosedJsonShape)
  );
};

export const isNonNegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

export const isPositiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

export const isClosedDigest = (value: unknown): value is Digest =>
  isPlainRecord(value) && hasExactKeys(value, ["algorithm", "value"]) && isDigest(value);

const isClosedSchemaRef = (value: unknown): boolean =>
  isPlainRecord(value) &&
  hasExactKeys(value, ["schemaId", "version", "digest"]) &&
  isClosedDigest(value.digest) &&
  isSchemaRef(value);

export const isResourceRef = (value: unknown): value is ResourceRef =>
  isPlainRecord(value) &&
  hasExactKeys(value, ["resourceId", "mediaType", "byteLength", "digest"]) &&
  isCanonicalUuid(value.resourceId) &&
  typeof value.mediaType === "string" &&
  MEDIA_TYPE.test(value.mediaType) &&
  isNonNegativeInteger(value.byteLength) &&
  isClosedDigest(value.digest);

export const isEvidenceRef = (value: unknown): value is EvidenceRef =>
  isPlainRecord(value) &&
  hasExactKeys(value, ["evidenceId", "kind", "content"], ["schema"]) &&
  isCanonicalUuid(value.evidenceId) &&
  [
    "artifact",
    "checkpoint",
    "evaluation",
    "event-payload",
    "execution-receipt",
    "other",
    "tool-arguments",
    "tool-result",
  ].includes(String(value.kind)) &&
  isResourceRef(value.content) &&
  (value.schema === undefined || isClosedSchemaRef(value.schema));

const isPortableContent = (value: unknown): value is PortableContent => {
  if (!isPlainRecord(value)) return false;
  const kind = ownDataValue(value, "kind");
  if (typeof kind !== "string") return false;
  if (kind === "text") {
    return hasExactKeys(value, ["kind", "text"]) && typeof value.text === "string";
  }
  if (kind === "json") {
    return (
      hasExactKeys(value, ["kind", "value"], ["schema"]) &&
      hasClosedJsonShape(value.value) &&
      isJsonValue(value.value) &&
      (value.schema === undefined || isClosedSchemaRef(value.schema))
    );
  }
  if (kind === "binary") {
    if (
      !hasExactKeys(value, ["kind", "mediaType", "encoding", "data", "byteLength", "digest"]) ||
      typeof value.mediaType !== "string" ||
      !MEDIA_TYPE.test(value.mediaType) ||
      value.encoding !== "base64" ||
      typeof value.data !== "string" ||
      !BASE64.test(value.data) ||
      !isNonNegativeInteger(value.byteLength) ||
      !isClosedDigest(value.digest)
    ) {
      return false;
    }
    const bytes = Buffer.from(value.data, "base64");
    return (
      bytes.byteLength === value.byteLength &&
      createHash("sha256").update(bytes).digest("hex") === value.digest.value
    );
  }
  return (
    kind === "media-ref" &&
    hasExactKeys(value, ["kind", "mediaType", "resource"], ["altText"]) &&
    typeof value.mediaType === "string" &&
    MEDIA_TYPE.test(value.mediaType) &&
    isResourceRef(value.resource) &&
    value.resource.mediaType === value.mediaType &&
    (value.altText === undefined || typeof value.altText === "string")
  );
};

const invalidCanonicalValue = (reason: string): never => {
  throw new TypeError(`Canonical context values require strict JSON: ${reason}.`);
};

const assertUnicodeScalarString = (value: string, location: string): void => {
  let index = 0;
  while (index < value.length) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        invalidCanonicalValue(`lone high surrogate in ${location}`);
      }
      index += 2;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      invalidCanonicalValue(`lone low surrogate in ${location}`);
    }
    index += 1;
  }
};

const normalizeNumber = (value: number): number => {
  if (!Number.isFinite(value)) return invalidCanonicalValue("non-finite number");
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
    return invalidCanonicalValue("unsafe integer");
  }
  return Object.is(value, -0) ? 0 : value;
};

const readDataProperty = (
  descriptor: PropertyDescriptor | undefined,
  location: string,
): unknown => {
  if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
    return invalidCanonicalValue(`non-data property at ${location}`);
  }
  return descriptor.value;
};

const normalizeJson = (value: unknown, ancestors: Set<object>): JsonValue => {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    assertUnicodeScalarString(value, "string value");
    return value;
  }
  if (typeof value === "number") return normalizeNumber(value);
  if (typeof value !== "object") return invalidCanonicalValue(typeof value);
  if (ancestors.has(value)) return invalidCanonicalValue("cyclic reference");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (!isDenseArray(value)) return invalidCanonicalValue("sparse or extended array");
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
    }
    if (!isPlainRecord(value)) return invalidCanonicalValue("non-plain object");
    const normalized: JsonObject = {};
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === "symbol")) {
      return invalidCanonicalValue("symbol-keyed property");
    }
    for (const key of (keys as string[]).sort()) {
      assertUnicodeScalarString(key, "object key");
      normalized[key] = normalizeJson(
        readDataProperty(descriptors[key], `object property ${key}`),
        ancestors,
      );
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
};

const serializeCanonical = (value: JsonValue): string => {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(serializeCanonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${serializeCanonical(value[key] as JsonValue)}`)
    .join(",")}}`;
};

export const canonicalJson = (value: unknown): string =>
  serializeCanonical(normalizeJson(value, new Set<object>()));

export const canonicalDigest = (value: unknown): Digest =>
  digest(createHash("sha256").update(canonicalJson(value)).digest("hex"));

export const portableContentBytes = (content: readonly PortableContent[]): number => {
  if (!isDenseArray(content)) {
    throw new TypeError("Context content arrays must be dense.");
  }
  return content.reduce((total, part) => {
    if (!isPortableContent(part)) {
      throw new TypeError("Context content must use the closed portable content union.");
    }
    if (part.kind === "text") return total + Buffer.byteLength(part.text, "utf8");
    if (part.kind === "json") return total + Buffer.byteLength(canonicalJson(part.value), "utf8");
    if (part.kind === "binary") return total + part.byteLength;
    return total + part.resource.byteLength;
  }, 0);
};

export const assertResourceRef = (value: unknown, label: string): ResourceRef => {
  if (!isResourceRef(value)) throw new TypeError(`${label} must be a closed ResourceRef.`);
  return value;
};

export const assertEvidenceRef = (value: unknown, label: string): EvidenceRef => {
  if (!isEvidenceRef(value)) throw new TypeError(`${label} must be a closed EvidenceRef.`);
  return value;
};
