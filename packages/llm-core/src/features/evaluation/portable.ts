import {
  isCanonicalUuid,
  isContractVersion,
  isDigest,
  isSchemaRef,
  type EvidenceRef,
  type ResourceRef,
  type SchemaRef,
} from "#contracts";

const MEDIA_TYPE =
  // eslint-disable-next-line sonarjs/regex-complexity -- mirrors the canonical contract media type syntax
  /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:\s*;\s*[A-Za-z0-9!#$&^_.+-]+=(?:[A-Za-z0-9!#$&^_.+-]+|"[^"]*"))*$/;

export const QUALIFIED_EVALUATION_ID =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

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

const isClosedDigest = (value: unknown): boolean =>
  isPlainRecord(value) && hasExactKeys(value, ["algorithm", "value"]) && isDigest(value);

const isClosedSchemaRef = (value: unknown): value is SchemaRef =>
  isPlainRecord(value) &&
  hasExactKeys(value, ["schemaId", "version", "digest"]) &&
  isClosedDigest(value.digest) &&
  isSchemaRef(value);

const isResourceRef = (value: unknown): value is ResourceRef =>
  isPlainRecord(value) &&
  hasExactKeys(value, ["resourceId", "mediaType", "byteLength", "digest"]) &&
  isCanonicalUuid(value.resourceId) &&
  typeof value.mediaType === "string" &&
  MEDIA_TYPE.test(value.mediaType) &&
  Number.isSafeInteger(value.byteLength) &&
  Number(value.byteLength) >= 0 &&
  isClosedDigest(value.digest);

const EVIDENCE_KINDS = new Set([
  "artifact",
  "checkpoint",
  "evaluation",
  "event-payload",
  "execution-receipt",
  "other",
  "tool-arguments",
  "tool-result",
]);

export const isEvidenceRef = (value: unknown): value is EvidenceRef =>
  isPlainRecord(value) &&
  hasExactKeys(value, ["evidenceId", "kind", "content"], ["schema"]) &&
  isCanonicalUuid(value.evidenceId) &&
  EVIDENCE_KINDS.has(String(value.kind)) &&
  isResourceRef(value.content) &&
  (value.schema === undefined || isClosedSchemaRef(value.schema));

export const isEvaluatorDescriptor = (
  value: unknown,
): value is {
  evaluatorId: string;
  version: string;
} =>
  isPlainRecord(value) &&
  hasExactKeys(value, ["evaluatorId", "version"]) &&
  typeof value.evaluatorId === "string" &&
  QUALIFIED_EVALUATION_ID.test(value.evaluatorId) &&
  isContractVersion(value.version);

export const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
};

export const cloneFrozen = <T>(value: T): T => deepFreeze(structuredClone(value));

export const portableBoundary = <T>(message: string, operation: () => T): T => {
  try {
    return operation();
  } catch (error) {
    throw new TypeError(message, { cause: error });
  }
};

export const evidenceRefsEqual = (left: EvidenceRef, right: EvidenceRef): boolean =>
  left.evidenceId === right.evidenceId &&
  left.kind === right.kind &&
  left.content.resourceId === right.content.resourceId &&
  left.content.mediaType === right.content.mediaType &&
  left.content.byteLength === right.content.byteLength &&
  left.content.digest.algorithm === right.content.digest.algorithm &&
  left.content.digest.value === right.content.digest.value &&
  (left.schema === undefined) === (right.schema === undefined) &&
  (left.schema === undefined ||
    right.schema === undefined ||
    (left.schema.schemaId === right.schema.schemaId &&
      left.schema.version === right.schema.version &&
      left.schema.digest.algorithm === right.schema.digest.algorithm &&
      left.schema.digest.value === right.schema.digest.value));
