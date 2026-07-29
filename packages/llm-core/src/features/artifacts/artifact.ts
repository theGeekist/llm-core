import {
  isCanonicalUuid,
  isDigest,
  isJsonValue,
  isSchemaRef,
  type EvidenceRef,
  type ResourceRef,
} from "#contracts";
import type { Artifact, ArtifactInput, ArtifactProvenance, ArtifactRef } from "./types";

const MEDIA_TYPE =
  // eslint-disable-next-line sonarjs/regex-complexity -- mirrors the canonical contract media type syntax
  /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:\s*;\s*[A-Za-z0-9!#$&^_.+-]+=(?:[A-Za-z0-9!#$&^_.+-]+|"[^"]*"))*$/;

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasExactKeys = (
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

const isDenseArray = (value: readonly unknown[]): boolean => {
  const keys = Reflect.ownKeys(value);
  const indices = keys.filter((key) => key !== "length");
  return (
    indices.length === value.length &&
    indices.every(
      (key) =>
        typeof key === "string" && /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < value.length,
    )
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

const isClosedDigest = (value: unknown): boolean =>
  isPlainRecord(value) &&
  hasExactKeys(value, ["algorithm", "value"]) &&
  isDigest(value);

const isClosedSchemaRef = (value: unknown): boolean =>
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

const isEvidenceRef = (value: unknown): value is EvidenceRef =>
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

function assertRef(value: unknown): asserts value is ArtifactRef {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["kind", "resource"], ["schema"]) ||
    value.kind !== "artifact" ||
    !isResourceRef(value.resource) ||
    (value.schema !== undefined && !isClosedSchemaRef(value.schema))
  ) {
    throw new TypeError(
      "Artifact references must be closed and use their ResourceRef identity and integrity.",
    );
  }
}

const assertEvidence = (value: unknown): void => {
  if (value !== undefined && !isEvidenceRef(value)) {
    throw new TypeError("Artifact provenance evidence must be a closed EvidenceRef.");
  }
};

function assertProvenance(value: unknown): asserts value is ArtifactProvenance {
  if (!isPlainRecord(value) || typeof value.kind !== "string") {
    throw new TypeError("Artifact provenance must be a closed portable record.");
  }
  if (value.kind === "supplied" && hasExactKeys(value, ["kind"], ["evidence"])) {
    assertEvidence(value.evidence);
    return;
  }
  if (
    value.kind === "generated" &&
    hasExactKeys(value, ["kind", "invocationId"], ["runId", "stepId", "evidence"]) &&
    isCanonicalUuid(value.invocationId) &&
    (value.runId === undefined || isCanonicalUuid(value.runId)) &&
    (value.stepId === undefined || isCanonicalUuid(value.stepId)) &&
    (value.stepId === undefined || value.runId !== undefined)
  ) {
    assertEvidence(value.evidence);
    return;
  }
  if (
    value.kind === "derived" &&
    hasExactKeys(value, ["kind", "sources", "operation"], ["evidence"]) &&
    Array.isArray(value.sources) &&
    value.sources.length > 0 &&
    isDenseArray(value.sources) &&
    typeof value.operation === "string" &&
    value.operation.length > 0
  ) {
    for (const source of value.sources) assertRef(source);
    if (
      new Set(
        value.sources.map((source) => source.resource.resourceId),
      ).size !== value.sources.length
    ) {
      throw new TypeError("Derived artifact provenance cannot contain duplicate sources.");
    }
    assertEvidence(value.evidence);
    return;
  }
  throw new TypeError("Artifact provenance is malformed or contains unknown fields.");
}

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

export const createArtifactRef = (
  content: ResourceRef,
  options: { schema?: ArtifactRef["schema"] } = {},
): ArtifactRef => {
  if (
    !isPlainRecord(options) ||
    !hasExactKeys(options, [], ["schema"]) ||
    (options.schema !== undefined && !isClosedSchemaRef(options.schema))
  ) {
    throw new TypeError("Artifact reference options must be a closed optional SchemaRef.");
  }
  const ref = {
    kind: "artifact" as const,
    resource: content,
    ...options,
  };
  assertRef(ref);
  return deepFreeze(structuredClone(ref));
};

export const createArtifact = (input: ArtifactInput): Artifact => {
  if (
    !isPlainRecord(input) ||
    !hasExactKeys(input, ["content", "provenance"], ["schema", "metadata"]) ||
    !isResourceRef(input.content) ||
    (input.schema !== undefined && !isClosedSchemaRef(input.schema)) ||
    (input.metadata !== undefined &&
      (!isPlainRecord(input.metadata) ||
        !isJsonValue(input.metadata) ||
        !hasClosedJsonShape(input.metadata)))
  ) {
    throw new TypeError("Artifacts require closed storage-neutral portable inputs.");
  }
  assertProvenance(input.provenance);
  const ref = createArtifactRef(input.content, {
    ...(input.schema ? { schema: input.schema } : {}),
  });
  return deepFreeze(
    structuredClone({
      ref,
      provenance: input.provenance,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }),
  );
};
