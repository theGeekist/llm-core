import { createHash } from "node:crypto";
import { canonicalize } from "@geekist/strict-json";
import {
  digest,
  isCanonicalUuid,
  isDigest,
  isJsonValue,
  isSchemaRef,
  type Digest,
  type EvidenceRef,
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

export const canonicalJson = (value: unknown): string => canonicalize(value);

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
