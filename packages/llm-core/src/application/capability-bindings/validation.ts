/* eslint-disable max-params -- Registration proof tuples keep kind, implementation identity, descriptor identity, claim, and trusted dependencies explicit. */
import {
  isCanonicalUuid,
  isContractVersion,
  isDigest,
  isExternalId,
  isNativeExtensions,
  isSchemaRef,
  type CapabilityBinding,
  type CapabilityClaim,
  type CapabilityConstraint,
  type ConformanceEvidence,
  type EvidenceRef,
  type NativeExtensions,
} from "#contracts";
import { isCapabilityClaim } from "../../contracts/capability-claim-validation";
import {
  cloneFrozen,
  deepFreeze,
  hasOnlyKeys,
  isPortableRecord as isRecord,
} from "#shared/portable-data";
import { isSensitivePortableString, isPortableJsonValue } from "../../features/storage/public";
import { CAPABILITY_PORT_DEFINITIONS, type CapabilityPortDefinition } from "./ports";
import type {
  AnyRegisteredRuntimeCapabilityBinding,
  CapabilityBindingDependencies,
  CapabilityPortKind,
  CapabilityPortMap,
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

const hasOnlyDataPropertiesDeep = (value: unknown, ancestors = new Set<object>()): boolean => {
  if (value === null || typeof value !== "object") return true;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  try {
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return keys.every((key) => {
      const descriptor = descriptors[key as string];
      return (
        descriptor !== undefined &&
        "value" in descriptor &&
        hasOnlyDataPropertiesDeep(descriptor.value, ancestors)
      );
    });
  } catch {
    return false;
  } finally {
    ancestors.delete(value);
  }
};

const readClosedBinding = (
  value: unknown,
): { kind: unknown; descriptor: unknown; port: unknown } | null => {
  try {
    if (!isRecord(value)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      Reflect.ownKeys(value).some((key) => typeof key !== "string") ||
      Object.keys(descriptors).sort().join(",") !== "descriptor,kind,port" ||
      !["kind", "descriptor", "port"].every((key) => "value" in descriptors[key]!)
    ) {
      return null;
    }
    return {
      kind: descriptors.kind!.value,
      descriptor: descriptors.descriptor!.value,
      port: descriptors.port!.value,
    };
  } catch {
    return null;
  }
};

const frozenDescriptorClone = <T>(value: T): T => {
  try {
    return cloneFrozen(value);
  } catch {
    throw new TypeError(
      "Capability descriptors must be closed, portable and implementation-bound.",
    );
  }
};

const isSafeExternalId = (value: unknown): value is string =>
  isExternalId(value) && !isSensitivePortableString(value);

const isCapabilityExtensions = (value: unknown): value is NativeExtensions =>
  isNativeExtensions(value) && isPortableJsonValue(value);

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
const EVIDENCE_OPTIONAL_KEYS = [
  "providerId",
  "providerVersion",
  "contractSchema",
  "extensions",
] as const;

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
  (value.contractSchema === undefined || isSchemaRef(value.contractSchema)) &&
  (value.extensions === undefined || isCapabilityExtensions(value.extensions));

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

const evidenceForClaim = (claim: CapabilityClaim): readonly ConformanceEvidence[] => [
  claim.evidence,
  ...(claim.additionalEvidence ?? []),
];

const isClaim = (value: unknown, bindingId: string): value is CapabilityClaim =>
  isCapabilityClaim(value, {
    isCapabilityId,
    isContractVersion,
    isEvidence: (evidence): evidence is ConformanceEvidence => isEvidence(evidence, bindingId),
    isConstraint,
    isExtensions: isCapabilityExtensions,
  });

const verifyClaimEvidence = (
  kind: CapabilityPortKind,
  implementationToken: object,
  bindingId: string,
  claim: CapabilityClaim,
  dependencies: CapabilityBindingDependencies,
): boolean =>
  evidenceForClaim(claim).every((evidence) => {
    try {
      return (
        dependencies.verifyEvidence(
          Object.freeze({
            bindingId,
            kind,
            implementationToken,
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
  kind: CapabilityPortKind,
  implementationToken: object,
  dependencies: CapabilityBindingDependencies,
): CapabilityBinding => {
  if (
    !isRecord(value) ||
    !hasOnlyDataPropertiesDeep(value) ||
    !hasOnlyKeys(value, ["bindingId", "claims"], ["extensions"]) ||
    (value.extensions !== undefined && !isCapabilityExtensions(value.extensions))
  ) {
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
  const descriptor = frozenDescriptorClone(value) as unknown as CapabilityBinding;
  if (
    !descriptor.claims.every((claim) =>
      verifyClaimEvidence(kind, implementationToken, descriptor.bindingId, claim, dependencies),
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

const bindPortSurface = <TKind extends CapabilityPortKind>(
  kind: TKind,
  port: CapabilityPortMap[TKind],
): CapabilityPortMap[TKind] => {
  const definition: CapabilityPortDefinition = CAPABILITY_PORT_DEFINITIONS[kind];
  const source = port as unknown as Record<string, unknown>;
  const facade: Record<string, unknown> = {};
  const missing = Symbol("missing-port-member");
  const capture = (member: string): unknown => {
    let cursor: object | null = source;
    try {
      while (cursor !== null) {
        const descriptor = Object.getOwnPropertyDescriptor(cursor, member);
        if (descriptor) {
          if (!("value" in descriptor)) {
            throw new TypeError("Live capability port accessors are not registrable.");
          }
          return descriptor.value;
        }
        cursor = Object.getPrototypeOf(cursor);
      }
    } catch {
      throw new TypeError("Live capability port surface could not be captured safely.");
    }
    return missing;
  };
  for (const method of [
    ...definition.requiredMethods,
    ...Object.keys(definition.optionalMethods ?? {}),
  ]) {
    const callable = capture(method);
    if (typeof callable === "function") {
      facade[method] = (callable as (...args: never[]) => unknown).bind(port);
    }
  }
  for (const property of definition.requiredProperties ?? []) {
    try {
      const captured = capture(property);
      if (captured === missing) {
        throw new TypeError("Live capability port property is missing.");
      }
      if (!hasOnlyDataPropertiesDeep(captured)) {
        throw new TypeError("Live capability port properties must use data records.");
      }
      facade[property] = deepFreeze(structuredClone(captured));
    } catch {
      throw new TypeError("Live capability port properties must be portable snapshots.");
    }
  }
  return Object.freeze(facade) as unknown as CapabilityPortMap[TKind];
};

export const registerRuntimeCapabilityBinding = <TKind extends CapabilityPortKind>(
  value: RuntimeCapabilityBinding<TKind>,
  dependencies: CapabilityBindingDependencies,
): RegisteredRuntimeCapabilityBinding<TKind> => {
  const candidate = readClosedBinding(value);
  if (
    candidate === null ||
    typeof candidate.kind !== "string" ||
    !PORT_KINDS.has(candidate.kind as CapabilityPortKind) ||
    (typeof candidate.port !== "object" && typeof candidate.port !== "function") ||
    candidate.port === null
  ) {
    throw new TypeError("Runtime capability bindings must use the closed typed binding union.");
  }
  const kind = candidate.kind as CapabilityPortKind;
  const port = bindPortSurface(kind as TKind, candidate.port as CapabilityPortMap[TKind]);
  const descriptor = registerDescriptor(candidate.descriptor, kind, port, dependencies);
  validatePort(kind, descriptor, port as object);
  const registered = Object.freeze({
    kind,
    descriptor,
    port,
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
