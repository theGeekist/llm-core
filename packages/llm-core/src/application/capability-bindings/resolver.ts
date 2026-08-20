import {
  isContractVersion,
  isExternalId,
  isNativeExtensions,
  type CapabilityClaim,
  type CapabilityConstraint,
  type CapabilityRequirement,
} from "#contracts";
import {
  cloneFrozen as frozenClone,
  hasOnlyKeys,
  isPortableRecord as isRecord,
} from "#shared/portable-data";
import { isPortableJsonValue, isSensitivePortableString } from "../../features/storage/public";
import { CAPABILITY_PORT_DEFINITIONS } from "./ports";
import { isRegisteredCapabilityCandidate } from "./validation";
/* eslint-disable max-params, sonarjs/cognitive-complexity -- Trust-boundary proof tuples and atomic fail-closed resolution remain explicit. */
import type {
  AnyRegisteredCapabilityCandidate,
  CapabilityBindingDiagnostic,
  CapabilityCandidateResolutionOutcome,
  CapabilityCandidateResolutionRequest,
  CapabilityConditionEvaluator,
  CapabilityPortKind,
  CapabilityPortRequirement,
} from "./types";

const resolvedCandidatePlans = new WeakSet<object>();

const CAPABILITY_ID = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const PORT_KINDS = new Set<CapabilityPortKind>(
  Object.keys(CAPABILITY_PORT_DEFINITIONS) as CapabilityPortKind[],
);

const isSafeExternalId = (value: unknown): value is string =>
  isExternalId(value) && !isSensitivePortableString(value);

const isCapabilityExtensions = (value: unknown): boolean =>
  isNativeExtensions(value) && isPortableJsonValue(value);

const isConstraint = (value: unknown): value is CapabilityConstraint =>
  isRecord(value) &&
  hasOnlyKeys(value, ["name", "value"]) &&
  typeof value.name === "string" &&
  isExternalId(value.name) &&
  isPortableJsonValue(value.value);

const isRequirement = (value: unknown): value is CapabilityRequirement =>
  isRecord(value) &&
  hasOnlyKeys(value, ["capabilityId"], ["versionRange", "required", "constraints", "extensions"]) &&
  typeof value.capabilityId === "string" &&
  CAPABILITY_ID.test(value.capabilityId) &&
  (value.versionRange === undefined || typeof value.versionRange === "string") &&
  (value.required === undefined || typeof value.required === "boolean") &&
  (value.extensions === undefined || isCapabilityExtensions(value.extensions)) &&
  (value.constraints === undefined ||
    (Array.isArray(value.constraints) && value.constraints.every(isConstraint)));

const isPortRequirement = (value: unknown): value is CapabilityPortRequirement =>
  isRecord(value) &&
  hasOnlyKeys(value, ["kind"], ["bindingId", "capabilities"]) &&
  typeof value.kind === "string" &&
  PORT_KINDS.has(value.kind as CapabilityPortKind) &&
  (value.bindingId === undefined || isSafeExternalId(value.bindingId)) &&
  (value.capabilities === undefined ||
    (Array.isArray(value.capabilities) && value.capabilities.every(isRequirement)));

const isBindingInput = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.kind === "string" &&
  PORT_KINDS.has(value.kind as CapabilityPortKind) &&
  isRecord(value.descriptor) &&
  isSafeExternalId(value.descriptor.bindingId);

const validateRequest = (request: CapabilityCandidateResolutionRequest): void => {
  if (
    !isRecord(request) ||
    !hasOnlyKeys(request, ["requirements", "candidates"], ["defaults"]) ||
    !Array.isArray(request.requirements) ||
    request.requirements.length === 0 ||
    !request.requirements.every(isPortRequirement) ||
    !Array.isArray(request.candidates) ||
    !request.candidates.every(isBindingInput) ||
    (request.defaults !== undefined &&
      (!isRecord(request.defaults) ||
        !Object.entries(request.defaults).every(
          ([kind, bindingId]) =>
            PORT_KINDS.has(kind as CapabilityPortKind) && isSafeExternalId(bindingId),
        )))
  ) {
    throw new TypeError("Capability resolution requires a closed typed plan.");
  }
};

// Keeping diagnostic construction centralized prevents unsafe detail strings.
// eslint-disable-next-line max-params
const diagnostic = (
  code: CapabilityBindingDiagnostic["code"],
  requirement: CapabilityPortRequirement,
  bindingId?: string,
  capabilityId?: string,
): CapabilityBindingDiagnostic => ({
  code,
  kind: requirement.kind,
  ...(bindingId === undefined ? {} : { bindingId }),
  ...(capabilityId === undefined ? {} : { capabilityId }),
});

const sortDiagnostics = (
  diagnostics: CapabilityBindingDiagnostic[],
): readonly CapabilityBindingDiagnostic[] =>
  Object.freeze(
    diagnostics.toSorted(
      (left, right) =>
        left.kind.localeCompare(right.kind) ||
        left.code.localeCompare(right.code) ||
        (left.bindingId ?? "").localeCompare(right.bindingId ?? "") ||
        (left.capabilityId ?? "").localeCompare(right.capabilityId ?? ""),
    ),
  );

const evaluateRange = (
  versionRange: string | undefined,
  version: string,
): "match" | "mismatch" | "unsupported" => {
  if (versionRange === undefined || versionRange === "" || versionRange === "*") {
    return "match";
  }
  if (!isContractVersion(versionRange)) {
    return "unsupported";
  }
  return versionRange === version ? "match" : "mismatch";
};

const matchingClaim = (
  binding: AnyRegisteredCapabilityCandidate,
  requirement: CapabilityRequirement,
  diagnostics: CapabilityBindingDiagnostic[],
): CapabilityClaim | null => {
  const claims = binding.descriptor.claims.filter(
    (claim) => claim.capabilityId === requirement.capabilityId && claim.status !== "unsupported",
  );
  const matches: CapabilityClaim[] = [];
  for (const claim of claims) {
    const range = evaluateRange(requirement.versionRange, claim.version);
    if (range === "unsupported") {
      diagnostics.push(
        diagnostic(
          "unsupported-version-range",
          { kind: binding.kind },
          binding.descriptor.bindingId,
          requirement.capabilityId,
        ),
      );
      return null;
    }
    if (range === "match") {
      matches.push(claim);
    }
  }
  return matches.length === 1 ? matches[0]! : null;
};

// The evaluator receives the complete immutable proof tuple.
// eslint-disable-next-line max-params
const evaluateConstraint = (
  evaluator: CapabilityConditionEvaluator | undefined,
  binding: AnyRegisteredCapabilityCandidate,
  claim: CapabilityClaim,
  requirement: CapabilityRequirement,
  constraint: CapabilityConstraint,
): boolean => {
  if (!evaluator) {
    return false;
  }
  try {
    return (
      evaluator(
        frozenClone({
          bindingId: binding.descriptor.bindingId,
          kind: binding.kind,
          claim,
          requirement,
          constraint,
        }),
      ) === true
    );
  } catch {
    return false;
  }
};

// The proof tuple must remain explicit at this trust boundary.
// eslint-disable-next-line max-params
const claimConditionsProven = (
  evaluator: CapabilityConditionEvaluator | undefined,
  binding: AnyRegisteredCapabilityCandidate,
  claim: CapabilityClaim,
  requirement: CapabilityRequirement,
): boolean => {
  const conditions = claim.status === "conditional" ? claim.conditions : [];
  const constraints = [...conditions, ...(requirement.constraints ?? [])];
  return constraints.every((constraint) =>
    evaluateConstraint(evaluator, binding, claim, requirement, constraint),
  );
};

// Compatibility is evaluated atomically with its safe diagnostic accumulator.
// eslint-disable-next-line max-params
const bindingCompatible = (
  binding: AnyRegisteredCapabilityCandidate,
  requirement: CapabilityPortRequirement,
  evaluator: CapabilityConditionEvaluator | undefined,
  diagnostics: CapabilityBindingDiagnostic[],
): boolean => {
  const primaryCapabilityId = CAPABILITY_PORT_DEFINITIONS[requirement.kind].capabilityId;
  const explicitPrimary = requirement.capabilities?.find(
    (capability) => capability.capabilityId === primaryCapabilityId,
  );
  const capabilities = [
    explicitPrimary
      ? { ...explicitPrimary, required: true }
      : { capabilityId: primaryCapabilityId, required: true },
    ...(requirement.capabilities ?? []).filter(
      (capability) => capability.capabilityId !== primaryCapabilityId,
    ),
  ];
  for (const capability of capabilities) {
    if (capability.required === false) {
      continue;
    }
    const claim = matchingClaim(binding, capability, diagnostics);
    if (!claim) {
      diagnostics.push(
        diagnostic(
          "incompatible-binding",
          requirement,
          binding.descriptor.bindingId,
          capability.capabilityId,
        ),
      );
      return false;
    }
    if (
      (claim.status === "conditional" || (capability.constraints?.length ?? 0) > 0) &&
      !claimConditionsProven(evaluator, binding, claim, capability)
    ) {
      diagnostics.push(
        diagnostic(
          "conditional-unproven",
          requirement,
          binding.descriptor.bindingId,
          capability.capabilityId,
        ),
      );
      return false;
    }
  }
  return true;
};

const duplicates = (
  request: CapabilityCandidateResolutionRequest,
): CapabilityBindingDiagnostic[] => {
  const diagnostics: CapabilityBindingDiagnostic[] = [];
  const requirementKinds = new Set<CapabilityPortKind>();
  for (const requirement of request.requirements) {
    if (requirementKinds.has(requirement.kind)) {
      diagnostics.push(diagnostic("duplicate-requirement", requirement));
    }
    requirementKinds.add(requirement.kind);
    const capabilityIds =
      requirement.capabilities?.map(
        (entry) => `${entry.capabilityId}@${entry.versionRange ?? "*"}`,
      ) ?? [];
    if (new Set(capabilityIds).size !== capabilityIds.length) {
      diagnostics.push(diagnostic("duplicate-requirement", requirement));
    }
  }
  const bindingKeys = new Set<string>();
  for (const binding of request.candidates) {
    const key = `${binding.kind}:${binding.descriptor.bindingId}`;
    if (bindingKeys.has(key)) {
      diagnostics.push(
        diagnostic("duplicate-binding", { kind: binding.kind }, binding.descriptor.bindingId),
      );
    }
    bindingKeys.add(key);
  }
  return diagnostics;
};

const candidateSelection = (
  request: CapabilityCandidateResolutionRequest,
  requirement: CapabilityPortRequirement,
): { bindingId?: string; mode: "exact" | "default" | "unique" } => {
  if (requirement.bindingId !== undefined) {
    return { bindingId: requirement.bindingId, mode: "exact" };
  }
  const defaultBinding = request.defaults?.[requirement.kind];
  return defaultBinding === undefined
    ? { mode: "unique" }
    : { bindingId: defaultBinding, mode: "default" };
};

// Resolution deliberately keeps all fail-closed branches in one atomic plan boundary.
// eslint-disable-next-line sonarjs/cognitive-complexity
export const resolveCapabilityCandidates = (
  request: CapabilityCandidateResolutionRequest,
  dependencies: { readonly evaluateCondition?: CapabilityConditionEvaluator } = {},
): CapabilityCandidateResolutionOutcome => {
  validateRequest(request);
  const diagnostics = duplicates(request);
  for (const binding of request.candidates) {
    if (!isRegisteredCapabilityCandidate(binding as unknown)) {
      diagnostics.push(
        diagnostic("invalid-binding", { kind: binding.kind }, binding.descriptor.bindingId),
      );
    }
  }
  if (diagnostics.length > 0) {
    return { kind: "unresolved", diagnostics: sortDiagnostics(diagnostics) };
  }

  const resolved: AnyRegisteredCapabilityCandidate[] = [];
  for (const requirement of request.requirements) {
    const allForKind = request.candidates.filter((binding) => binding.kind === requirement.kind);
    const selection = candidateSelection(request, requirement);
    if (selection.bindingId !== undefined) {
      const selected = allForKind.find(
        (binding) => binding.descriptor.bindingId === selection.bindingId,
      );
      if (!selected) {
        diagnostics.push(diagnostic("unknown-binding", requirement, selection.bindingId));
        continue;
      }
      if (!bindingCompatible(selected, requirement, dependencies.evaluateCondition, diagnostics)) {
        continue;
      }
      resolved.push(selected);
      diagnostics.push(
        diagnostic(
          selection.mode === "exact" ? "selected-exact" : "selected-default",
          requirement,
          selected.descriptor.bindingId,
        ),
      );
      continue;
    }

    const eligible = allForKind.filter((binding) =>
      bindingCompatible(binding, requirement, dependencies.evaluateCondition, diagnostics),
    );
    if (eligible.length === 0) {
      diagnostics.push(
        diagnostic(
          allForKind.length === 0 ? "missing-binding" : "incompatible-binding",
          requirement,
        ),
      );
      continue;
    }
    if (eligible.length > 1) {
      diagnostics.push(diagnostic("ambiguous-binding", requirement));
      continue;
    }
    resolved.push(eligible[0]!);
    diagnostics.push(diagnostic("selected-unique", requirement, eligible[0]!.descriptor.bindingId));
  }

  if (resolved.length !== request.requirements.length) {
    return { kind: "unresolved", diagnostics: sortDiagnostics(diagnostics) };
  }
  const plan = Object.freeze({
    kind: "resolved",
    candidates: Object.freeze(
      resolved.toSorted((left, right) => left.kind.localeCompare(right.kind)),
    ),
    diagnostics: sortDiagnostics(diagnostics),
  }) as CapabilityCandidateResolutionOutcome & { readonly kind: "resolved" };
  resolvedCandidatePlans.add(plan);
  return plan;
};

export const isResolvedCapabilityCandidatePlan = (
  value: CapabilityCandidateResolutionOutcome,
): value is CapabilityCandidateResolutionOutcome & { readonly kind: "resolved" } =>
  typeof value === "object" && value !== null && resolvedCandidatePlans.has(value);
