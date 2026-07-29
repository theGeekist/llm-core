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

export const snapshotExactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> | null => {
  if (!isPlainRecord(value)) return null;
  const keys = Reflect.ownKeys(value);
  if (
    !keys.every(
      (key) => typeof key === "string" && (required.includes(key) || optional.includes(key)),
    ) ||
    !required.every((key) => keys.includes(key))
  ) {
    return null;
  }
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    if (typeof key !== "string") return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true || !("value" in descriptor)) return null;
    snapshot[key] = descriptor.value;
  }
  return snapshot;
};

export const snapshotDenseArray = (value: unknown): readonly unknown[] | null => {
  if (!Array.isArray(value)) return null;
  const keys = Reflect.ownKeys(value);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    Number(lengthDescriptor.value) < 0
  ) {
    return null;
  }
  const length = Number(lengthDescriptor.value);
  const indices = keys.filter((key) => key !== "length");
  if (indices.length !== length) return null;
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor?.enumerable !== true || !("value" in descriptor)) return null;
    snapshot.push(descriptor.value);
  }
  return snapshot;
};

const snapshotClosedDigest = (value: unknown) => {
  const snapshot = snapshotExactRecord(value, ["algorithm", "value"]);
  return snapshot !== null && isDigest(snapshot) ? snapshot : null;
};

const snapshotClosedSchemaRef = (value: unknown): SchemaRef | null => {
  const snapshot = snapshotExactRecord(value, ["schemaId", "version", "digest"]);
  if (snapshot === null) return null;
  const digest = snapshotClosedDigest(snapshot.digest);
  const candidate = { schemaId: snapshot.schemaId, version: snapshot.version, digest };
  return digest !== null && isSchemaRef(candidate) ? (candidate as SchemaRef) : null;
};

const snapshotResourceRef = (value: unknown): ResourceRef | null => {
  const snapshot = snapshotExactRecord(value, ["resourceId", "mediaType", "byteLength", "digest"]);
  if (snapshot === null) return null;
  const digest = snapshotClosedDigest(snapshot.digest);
  if (
    !isCanonicalUuid(snapshot.resourceId) ||
    typeof snapshot.mediaType !== "string" ||
    !MEDIA_TYPE.test(snapshot.mediaType) ||
    !Number.isSafeInteger(snapshot.byteLength) ||
    Number(snapshot.byteLength) < 0 ||
    digest === null
  ) {
    return null;
  }
  return {
    resourceId: snapshot.resourceId as ResourceRef["resourceId"],
    mediaType: snapshot.mediaType,
    byteLength: snapshot.byteLength as number,
    digest,
  };
};

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

export const snapshotEvidenceRef = (value: unknown): EvidenceRef | null => {
  const snapshot = snapshotExactRecord(value, ["evidenceId", "kind", "content"], ["schema"]);
  if (snapshot === null) return null;
  const content = snapshotResourceRef(snapshot.content);
  const schemaPresent = Object.hasOwn(snapshot, "schema");
  const schema = schemaPresent ? snapshotClosedSchemaRef(snapshot.schema) : null;
  if (
    !isCanonicalUuid(snapshot.evidenceId) ||
    !EVIDENCE_KINDS.has(String(snapshot.kind)) ||
    content === null ||
    (schemaPresent && schema === null)
  ) {
    return null;
  }
  return {
    evidenceId: snapshot.evidenceId as EvidenceRef["evidenceId"],
    kind: snapshot.kind as EvidenceRef["kind"],
    content,
    ...(schema === null ? {} : { schema }),
  };
};

export const snapshotEvaluatorDescriptor = (
  value: unknown,
): { evaluatorId: string; version: string } | null => {
  const snapshot = snapshotExactRecord(value, ["evaluatorId", "version"]);
  return snapshot !== null &&
    typeof snapshot.evaluatorId === "string" &&
    QUALIFIED_EVALUATION_ID.test(snapshot.evaluatorId) &&
    isContractVersion(snapshot.version)
    ? { evaluatorId: snapshot.evaluatorId, version: snapshot.version }
    : null;
};

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
