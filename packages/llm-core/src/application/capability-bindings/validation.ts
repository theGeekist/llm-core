import {
  isCanonicalUuid,
  isContractVersion,
  isDigest,
  isExternalId,
  isSchemaRef,
  type CapabilityBinding,
  type CapabilityClaim,
  type CapabilityConstraint,
  type ConformanceEvidence,
  type EvidenceRef,
} from "#contracts";
import { isSensitivePortableString, isPortableJsonValue } from "../../features/storage/public";
import { CAPABILITY_PORT_DEFINITIONS, type CapabilityPortDefinition } from "./ports";
import type {
  AnyRegisteredRuntimeCapabilityBinding,
  CapabilityBindingDependencies,
  CapabilityPortKind,
  RegisteredRuntimeCapabilityBinding,
  RuntimeCapabilityBinding,
} from "./types";

const CAPABILITY_ID = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const MEDIA_TYPE =
  // This is the closed RFC-style media-type subset accepted by portable evidence.
  // eslint-disable-next-line sonarjs/regex-complexity
  /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:\s*;\s*[A-Za-z0-9!#$&^_.+-]+=(?:[A-Za-z0-9!#$&^_.+-]+|"[^"]*"))*$/;
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
const PORT_KINDS = new Set<CapabilityPortKind>(
  Object.keys(CAPABILITY_PORT_DEFINITIONS) as CapabilityPortKind[],
);
const registeredBindings = new WeakSet<object>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const hasOnlyKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
};

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
};

const frozenClone = <T>(value: T): T => deepFreeze(structuredClone(value));

const isSafeExternalId = (value: unknown): value is string =>
  isExternalId(value) && !isSensitivePortableString(value);

const isCapabilityId = (value: unknown): value is string =>
  typeof value === "string" && CAPABILITY_ID.test(value);

const isCanonicalTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const isResourceRef = (value: unknown): boolean =>
  isRecord(value) &&
  hasOnlyKeys(value, ["resourceId", "mediaType", "byteLength", "digest"]) &&
  isCanonicalUuid(value.resourceId) &&
  typeof value.mediaType === "string" &&
  MEDIA_TYPE.test(value.mediaType) &&
  Number.isSafeInteger(value.byteLength) &&
  (value.byteLength as number) >= 0 &&
  isDigest(value.digest);

const isEvidenceRef = (value: unknown): value is EvidenceRef =>
  isRecord(value) &&
  hasOnlyKeys(value, ["evidenceId", "kind", "content"], ["schema"]) &&
  isCanonicalUuid(value.evidenceId) &&
  typeof value.kind === "string" &&
  EVIDENCE_KINDS.has(value.kind) &&
  isResourceRef(value.content) &&
  (value.schema === undefined || isSchemaRef(value.schema));

const isConstraint = (value: unknown): value is CapabilityConstraint =>
  isRecord(value) &&
  hasOnlyKeys(value, ["name", "value"]) &&
  isSafeExternalId(value.name) &&
  isPortableJsonValue(value.value);

const isConstraintList = (value: unknown, minimum: number): value is CapabilityConstraint[] =>
  Array.isArray(value) && value.length >= minimum && value.every(isConstraint);

const EVIDENCE_REQUIRED_KEYS = [
  "report",
  "suiteId",
  "suiteVersion",
  "observedAt",
  "implementationId",
  "implementationVersion",
  "result",
] as const;
const EVIDENCE_OPTIONAL_KEYS = ["providerId", "providerVersion", "contractSchema"] as const;

const isEvidenceBase = (value: Record<string, unknown>, bindingId: string): boolean =>
  isEvidenceRef(value.report) &&
  isCapabilityId(value.suiteId) &&
  isContractVersion(value.suiteVersion) &&
  isCanonicalTimestamp(value.observedAt) &&
  value.implementationId === bindingId &&
  isSafeExternalId(value.implementationId) &&
  typeof value.implementationVersion === "string" &&
  value.implementationVersion.length > 0 &&
  !isSensitivePortableString(value.implementationVersion) &&
  (value.providerId === undefined || isSafeExternalId(value.providerId)) &&
  (value.providerVersion === undefined ||
    (typeof value.providerVersion === "string" &&
      value.providerVersion.length > 0 &&
      !isSensitivePortableString(value.providerVersion))) &&
  (value.contractSchema === undefined || isSchemaRef(value.contractSchema));

const isEvidence = (value: unknown, bindingId: string): value is ConformanceEvidence => {
  if (!isRecord(value) || !isEvidenceBase(value, bindingId)) {
    return false;
  }
  if (value.result === "pass") {
    return hasOnlyKeys(value, EVIDENCE_REQUIRED_KEYS, EVIDENCE_OPTIONAL_KEYS);
  }
  if (value.result === "partial") {
    return (
      hasOnlyKeys(value, [...EVIDENCE_REQUIRED_KEYS, "limitations"], EVIDENCE_OPTIONAL_KEYS) &&
      isConstraintList(value.limitations, 1)
    );
  }
  return (
    value.result === "fail" &&
    hasOnlyKeys(value, [...EVIDENCE_REQUIRED_KEYS, "failures"], EVIDENCE_OPTIONAL_KEYS) &&
    isConstraintList(value.failures, 1)
  );
};

const CLAIM_REQUIRED_KEYS = ["capabilityId", "version", "status", "evidence"] as const;
const CLAIM_OPTIONAL_KEYS = ["additionalEvidence"] as const;

const evidenceForClaim = (claim: CapabilityClaim): readonly ConformanceEvidence[] => [
  claim.evidence,
  ...(claim.additionalEvidence ?? []),
];

const isClaim = (value: unknown, bindingId: string): value is CapabilityClaim => {
  if (
    !isRecord(value) ||
    !isCapabilityId(value.capabilityId) ||
    !isContractVersion(value.version) ||
    !isEvidence(value.evidence, bindingId) ||
    (value.additionalEvidence !== undefined &&
      (!Array.isArray(value.additionalEvidence) ||
        !value.additionalEvidence.every((entry) => isEvidence(entry, bindingId))))
  ) {
    return false;
  }
  if (value.status === "supported") {
    return (
      hasOnlyKeys(value, CLAIM_REQUIRED_KEYS, CLAIM_OPTIONAL_KEYS) &&
      value.evidence.result === "pass"
    );
  }
  if (value.status === "conditional") {
    return (
      hasOnlyKeys(value, [...CLAIM_REQUIRED_KEYS, "conditions"], CLAIM_OPTIONAL_KEYS) &&
      (value.evidence.result === "pass" || value.evidence.result === "partial") &&
      isConstraintList(value.conditions, 1)
    );
  }
  return (
    value.status === "unsupported" &&
    hasOnlyKeys(value, CLAIM_REQUIRED_KEYS, CLAIM_OPTIONAL_KEYS) &&
    value.evidence.result === "fail"
  );
};

const verifyClaimEvidence = (
  bindingId: string,
  claim: CapabilityClaim,
  dependencies: CapabilityBindingDependencies,
): boolean =>
  evidenceForClaim(claim).every((evidence) => {
    try {
      return (
        dependencies.verifyEvidence(
          frozenClone({
            bindingId,
            claim,
            evidence,
          }),
        ) === true
      );
    } catch {
      return false;
    }
  });

const registerDescriptor = (
  value: unknown,
  dependencies: CapabilityBindingDependencies,
): CapabilityBinding => {
  if (!isRecord(value) || !hasOnlyKeys(value, ["bindingId", "claims"])) {
    throw new TypeError(
      "Capability descriptors must be closed, portable and implementation-bound.",
    );
  }
  const bindingId = value.bindingId;
  if (
    !isSafeExternalId(bindingId) ||
    !Array.isArray(value.claims) ||
    value.claims.length === 0 ||
    !value.claims.every((claim) => isClaim(claim, bindingId))
  ) {
    throw new TypeError(
      "Capability descriptors must be closed, portable and implementation-bound.",
    );
  }
  const identities = value.claims.map(
    (claim) => `${(claim as CapabilityClaim).capabilityId}@${(claim as CapabilityClaim).version}`,
  );
  if (new Set(identities).size !== identities.length) {
    throw new TypeError("Capability descriptors cannot contain duplicate claim identities.");
  }
  const descriptor = frozenClone(value) as unknown as CapabilityBinding;
  if (
    !descriptor.claims.every((claim) =>
      verifyClaimEvidence(descriptor.bindingId, claim, dependencies),
    )
  ) {
    throw new TypeError("Capability evidence verification failed.");
  }
  return descriptor;
};

const eligibleClaim = (
  descriptor: CapabilityBinding,
  capabilityId: string,
): CapabilityClaim | null => {
  const claims = descriptor.claims.filter(
    (claim) => claim.capabilityId === capabilityId && claim.status !== "unsupported",
  );
  return claims.length === 1 ? claims[0]! : null;
};

const validatePort = (
  kind: CapabilityPortKind,
  descriptor: CapabilityBinding,
  port: object,
): void => {
  const definition: CapabilityPortDefinition = CAPABILITY_PORT_DEFINITIONS[kind];
  if (!eligibleClaim(descriptor, definition.capabilityId)) {
    throw new TypeError("Capability descriptor does not prove the selected port kind.");
  }
  for (const method of definition.requiredMethods) {
    if (typeof (port as Record<string, unknown>)[method] !== "function") {
      throw new TypeError("Live capability port does not implement its required surface.");
    }
  }
  for (const property of definition.requiredProperties ?? []) {
    if (!(property in port)) {
      throw new TypeError("Live capability port does not implement its required surface.");
    }
  }
  for (const [method, capabilityId] of Object.entries(definition.optionalMethods ?? {})) {
    const hasMethod = typeof (port as Record<string, unknown>)[method] === "function";
    const hasClaim = eligibleClaim(descriptor, capabilityId) !== null;
    if (hasMethod !== hasClaim) {
      throw new TypeError("Optional live port methods and capability evidence must agree.");
    }
  }
};

export const registerRuntimeCapabilityBinding = <TKind extends CapabilityPortKind>(
  value: RuntimeCapabilityBinding<TKind>,
  dependencies: CapabilityBindingDependencies,
): RegisteredRuntimeCapabilityBinding<TKind> => {
  const candidate: unknown = value;
  if (
    !isRecord(candidate) ||
    !hasOnlyKeys(candidate, ["kind", "descriptor", "port"]) ||
    typeof candidate.kind !== "string" ||
    !PORT_KINDS.has(candidate.kind as CapabilityPortKind) ||
    (typeof candidate.port !== "object" && typeof candidate.port !== "function") ||
    candidate.port === null
  ) {
    throw new TypeError("Runtime capability bindings must use the closed typed binding union.");
  }
  const kind = candidate.kind as CapabilityPortKind;
  const descriptor = registerDescriptor(candidate.descriptor, dependencies);
  validatePort(kind, descriptor, candidate.port as object);
  const registered = Object.freeze({
    kind,
    descriptor,
    port: candidate.port,
  }) as RegisteredRuntimeCapabilityBinding<TKind>;
  registeredBindings.add(registered);
  return registered;
};

export const isRegisteredRuntimeCapabilityBinding = (
  value: unknown,
): value is AnyRegisteredRuntimeCapabilityBinding =>
  typeof value === "object" && value !== null && registeredBindings.has(value);

export const assertRegisteredRuntimeCapabilityBinding = (
  value: AnyRegisteredRuntimeCapabilityBinding,
): void => {
  if (!isRegisteredRuntimeCapabilityBinding(value)) {
    throw new TypeError("Capability resolution accepts only registered runtime bindings.");
  }
};
