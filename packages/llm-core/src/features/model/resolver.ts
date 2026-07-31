import { isContractVersion } from "#contracts";
import type {
  CapabilityClaim,
  CapabilityConstraint,
  CapabilityId,
  CapabilityRequirement,
  ContractVersion,
  PortableImplementationId,
} from "#contracts";
import { deepFreeze } from "./freeze";
import { isRegisteredModelProfile, type ModelProfile } from "./profile";
import type { DeploymentRef, ModelRef, ProviderRef } from "./references";

/**
 * Deterministic model resolution (ADR-004).
 *
 * Resolution accepts selection intent, required capabilities, caller/composition
 * bindings and routing policy, and returns the selected binding with resolved
 * references, the profile/evidence, and diagnostics. It never reads environment
 * credentials, never silently downgrades a capability, and never falls back to a
 * first-list default: an unresolved tie fails as ambiguous, zero eligible
 * bindings fails explicitly, and every unproven requirement or policy fails
 * closed.
 *
 * Evaluators are trusted composition dependencies of the resolver, not
 * per-request input. They receive frozen minimal snapshots, must return exactly
 * `true`, and any throw or non-boolean result is a fail-closed diagnostic.
 */

/** One configured implementation eligible to satisfy a selection. */
export interface ModelBinding {
  readonly bindingId: PortableImplementationId;
  readonly model: ModelRef;
  readonly provider: ProviderRef;
  readonly deployment: DeploymentRef;
  readonly profile: ModelProfile;
  /** Policy aliases that also select this binding. Exact model match wins. */
  readonly aliases?: readonly ModelRef[];
}

/** Frozen, minimal view of a binding handed to trusted evaluators. */
export interface BindingSnapshot {
  readonly bindingId: PortableImplementationId;
  readonly model: ModelRef;
  readonly provider: ProviderRef;
  readonly deployment: DeploymentRef;
}

/** Frozen, minimal view of a supported claim handed to a constraint evaluator. */
export interface ClaimSnapshot {
  readonly capabilityId: CapabilityId;
  readonly version: ContractVersion;
  readonly status: CapabilityClaim["status"];
}

export type ConstraintEvaluator = (input: {
  readonly binding: BindingSnapshot;
  readonly claim: ClaimSnapshot;
  readonly requirement: CapabilityRequirement;
  readonly constraint: CapabilityConstraint;
}) => boolean;

export type PolicyEvaluator = (input: { readonly binding: BindingSnapshot }) => boolean;

/** Trusted, composition-owned resolver dependencies. */
export interface ModelResolverDependencies {
  readonly constraintEvaluator?: ConstraintEvaluator;
  readonly policyEvaluator?: PolicyEvaluator;
}

/** Composition-owned routing policy. Allow-lists and default are pure data. */
export interface ModelResolutionPolicy {
  readonly defaultModel?: ModelRef;
  readonly allowedModels?: readonly ModelRef[];
  readonly allowedProviders?: readonly ProviderRef[];
  readonly allowedDeployments?: readonly DeploymentRef[];
  readonly allowedBindings?: readonly PortableImplementationId[];
}

export interface ModelResolutionRequest {
  readonly selection?: ModelRef;
  readonly requiredCapabilities?: readonly CapabilityRequirement[];
  readonly bindings: readonly ModelBinding[];
  readonly policy?: ModelResolutionPolicy;
}

export type ResolutionMatch = "exact" | "alias" | "default";

export type ResolutionDiagnosticCode =
  | "selected-exact"
  | "selected-alias"
  | "selected-default"
  | "excluded-capability"
  | "unregistered-profile"
  | "binding-profile-mismatch"
  | "unsupported-version-range"
  | "unproven-constraint"
  | "policy-excluded"
  | "evaluator-error"
  | "no-eligible-binding"
  | "ambiguous-selection"
  | "unknown-selection";

export interface ResolutionDiagnostic {
  code: ResolutionDiagnosticCode;
  message: string;
  bindingId?: PortableImplementationId;
}

export interface ModelResolution {
  binding: ModelBinding;
  model: ModelRef;
  provider: ProviderRef;
  deployment: DeploymentRef;
  profile: ModelProfile;
  matchedBy: ResolutionMatch;
  diagnostics: ResolutionDiagnostic[];
}

export type UnresolvedReason = "no-eligible-binding" | "ambiguous" | "unknown-selection";

export type ModelResolutionOutcome =
  | { kind: "resolved"; resolution: ModelResolution }
  | { kind: "unresolved"; reason: UnresolvedReason; diagnostics: ResolutionDiagnostic[] };

export interface ModelResolver {
  resolve(request: ModelResolutionRequest): ModelResolutionOutcome;
}

/** Per-binding evaluation state, bundled to keep helper arity within limits. */
interface EvalContext {
  binding: ModelBinding;
  deps: ModelResolverDependencies;
  diagnostics: ResolutionDiagnostic[];
}

type RangeResult = "any" | "exact-match" | "exact-mismatch" | "unsupported";

// The current resolver supports an absent/`*` range or an exact SemVer only. A range operator
// (`^`, `~`, ranges) is reported as unsupported rather than silently treated as
// an exact match, so resolution never downgrades on an unproven range.
const evaluateRange = (range: string | undefined, version: string): RangeResult => {
  if (range === undefined || range === "" || range === "*") {
    return "any";
  }
  if (!isContractVersion(range)) {
    return "unsupported";
  }
  return range === version ? "exact-match" : "exact-mismatch";
};

const profileMatchesBinding = (binding: ModelBinding): boolean =>
  binding.model === binding.profile.model &&
  binding.provider === binding.profile.provider &&
  binding.deployment === binding.profile.deployment;

const snapshotBinding = (binding: ModelBinding): BindingSnapshot =>
  deepFreeze({
    bindingId: binding.bindingId,
    model: binding.model,
    provider: binding.provider,
    deployment: binding.deployment,
  });

const snapshotClaim = (claim: CapabilityClaim): ClaimSnapshot =>
  deepFreeze({ capabilityId: claim.capabilityId, version: claim.version, status: claim.status });

// A trusted evaluator must return exactly `true`. A throw or any other value is
// treated as an explicit, fail-closed rejection.
type Verdict = "ok" | "rejected" | "errored";
const guarded = (run: () => unknown): Verdict => {
  try {
    return run() === true ? "ok" : "rejected";
  } catch {
    return "errored";
  }
};

const inList = <T>(list: readonly T[] | undefined, value: T): boolean =>
  list === undefined || list.includes(value);

const findSupportedClaim = (
  context: EvalContext,
  requirement: CapabilityRequirement,
): CapabilityClaim | undefined => {
  let found: CapabilityClaim | undefined;
  let sawUnsupportedRange = false;
  for (const claim of context.binding.profile.claims) {
    if (claim.status !== "supported" || claim.capabilityId !== requirement.capabilityId) {
      continue;
    }
    const range = evaluateRange(requirement.versionRange, claim.version);
    if (range === "unsupported") {
      sawUnsupportedRange = true;
      continue;
    }
    if (range === "any" || range === "exact-match") {
      found = claim;
      break;
    }
  }
  if (!found && sawUnsupportedRange) {
    context.diagnostics.push({
      code: "unsupported-version-range",
      message: `requirement ${requirement.capabilityId} uses an unsupported version range "${requirement.versionRange}"`,
      bindingId: context.binding.bindingId,
    });
  }
  return found;
};

const constraintsProven = (
  context: EvalContext,
  requirement: CapabilityRequirement,
  claim: CapabilityClaim,
): boolean => {
  const constraints = requirement.constraints ?? [];
  if (constraints.length === 0) {
    return true;
  }
  const { binding, deps, diagnostics } = context;
  const evaluator = deps.constraintEvaluator;
  if (!evaluator) {
    diagnostics.push({
      code: "unproven-constraint",
      message: `requirement ${requirement.capabilityId} carries constraints but the resolver has no constraint evaluator`,
      bindingId: binding.bindingId,
    });
    return false;
  }
  const bindingSnapshot = snapshotBinding(binding);
  const claimSnapshot = snapshotClaim(claim);
  const requirementSnapshot = deepFreeze(structuredClone(requirement));
  for (const constraint of constraints) {
    const constraintSnapshot = deepFreeze(structuredClone(constraint));
    const verdict = guarded(() =>
      evaluator({
        binding: bindingSnapshot,
        claim: claimSnapshot,
        requirement: requirementSnapshot,
        constraint: constraintSnapshot,
      }),
    );
    if (verdict !== "ok") {
      diagnostics.push({
        code: verdict === "errored" ? "evaluator-error" : "unproven-constraint",
        message:
          verdict === "errored"
            ? `constraint evaluator threw or returned a non-boolean for ${requirement.capabilityId}`
            : `binding ${binding.bindingId} does not satisfy a constraint for ${requirement.capabilityId}`,
        bindingId: binding.bindingId,
      });
      return false;
    }
  }
  return true;
};

const policyAllows = (context: EvalContext, policy: ModelResolutionPolicy | undefined): boolean => {
  const { binding, deps, diagnostics } = context;
  if (
    policy &&
    (!inList(policy.allowedModels, binding.model) ||
      !inList(policy.allowedProviders, binding.provider) ||
      !inList(policy.allowedDeployments, binding.deployment) ||
      !inList(policy.allowedBindings, binding.bindingId))
  ) {
    diagnostics.push({
      code: "policy-excluded",
      message: `binding ${binding.bindingId} is excluded by routing policy allow-lists`,
      bindingId: binding.bindingId,
    });
    return false;
  }
  const evaluator = deps.policyEvaluator;
  if (evaluator) {
    const verdict = guarded(() => evaluator({ binding: snapshotBinding(binding) }));
    if (verdict !== "ok") {
      diagnostics.push({
        code: verdict === "errored" ? "evaluator-error" : "policy-excluded",
        message:
          verdict === "errored"
            ? `policy evaluator threw or returned a non-boolean for ${binding.bindingId}`
            : `binding ${binding.bindingId} was rejected by the policy evaluator`,
        bindingId: binding.bindingId,
      });
      return false;
    }
  }
  return true;
};

const bindingEligible = (
  context: EvalContext,
  requirements: readonly CapabilityRequirement[],
  policy: ModelResolutionPolicy | undefined,
): boolean => {
  const { binding, diagnostics } = context;
  if (!isRegisteredModelProfile(binding.profile)) {
    diagnostics.push({
      code: "unregistered-profile",
      message: `binding ${binding.bindingId} references an unregistered model profile`,
      bindingId: binding.bindingId,
    });
    return false;
  }
  if (!profileMatchesBinding(binding)) {
    diagnostics.push({
      code: "binding-profile-mismatch",
      message: `binding ${binding.bindingId} references a profile whose model/provider/deployment differ from the binding`,
      bindingId: binding.bindingId,
    });
    return false;
  }
  if (!policyAllows(context, policy)) {
    return false;
  }
  for (const requirement of requirements) {
    if (requirement.required === false) {
      continue;
    }
    const claim = findSupportedClaim(context, requirement);
    if (!claim) {
      diagnostics.push({
        code: "excluded-capability",
        message: `binding lacks a supported claim for ${requirement.capabilityId}`,
        bindingId: binding.bindingId,
      });
      return false;
    }
    if (!constraintsProven(context, requirement, claim)) {
      return false;
    }
  }
  return true;
};

const selectTier = (
  bindings: readonly ModelBinding[],
  target: ModelRef,
): { matches: ModelBinding[]; via: "exact" | "alias" } => {
  const exact = bindings.filter((binding) => binding.model === target);
  if (exact.length > 0) {
    return { matches: exact, via: "exact" };
  }
  const alias = bindings.filter((binding) => (binding.aliases ?? []).includes(target));
  return { matches: alias, via: "alias" };
};

export const createModelResolver = (
  dependencies: ModelResolverDependencies = {},
): ModelResolver => ({
  resolve(request) {
    const diagnostics: ResolutionDiagnostic[] = [];
    const requirements = request.requiredCapabilities ?? [];

    const origin: ResolutionMatch = request.selection ? "exact" : "default";
    const target = request.selection ?? request.policy?.defaultModel;
    if (target === undefined) {
      diagnostics.push({
        code: "unknown-selection",
        message: "no selection was provided and no named default model is configured",
      });
      return { kind: "unresolved", reason: "unknown-selection", diagnostics };
    }

    const tier = selectTier(request.bindings, target);
    if (tier.matches.length === 0) {
      diagnostics.push({
        code: "no-eligible-binding",
        message: `no binding matches model ${target}`,
      });
      return { kind: "unresolved", reason: "no-eligible-binding", diagnostics };
    }

    const eligible = tier.matches.filter((binding) =>
      bindingEligible({ binding, deps: dependencies, diagnostics }, requirements, request.policy),
    );
    const [binding, ...rest] = eligible;
    if (!binding) {
      diagnostics.push({
        code: "no-eligible-binding",
        message: `all matches for ${target} were excluded by required capabilities or policy`,
      });
      return { kind: "unresolved", reason: "no-eligible-binding", diagnostics };
    }
    if (rest.length > 0) {
      diagnostics.push({
        code: "ambiguous-selection",
        message: `${eligible.length} eligible bindings match ${target}`,
      });
      return { kind: "unresolved", reason: "ambiguous", diagnostics };
    }

    const matchedBy: ResolutionMatch = origin === "default" ? "default" : tier.via;
    diagnostics.push({
      code:
        matchedBy === "default"
          ? "selected-default"
          : matchedBy === "alias"
            ? "selected-alias"
            : "selected-exact",
      message: `selected ${binding.bindingId} for ${target}`,
      bindingId: binding.bindingId,
    });

    return {
      kind: "resolved",
      resolution: {
        binding,
        model: binding.model,
        provider: binding.provider,
        deployment: binding.deployment,
        profile: binding.profile,
        matchedBy,
        diagnostics,
      },
    };
  },
});
