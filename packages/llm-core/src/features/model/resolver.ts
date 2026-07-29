import { isContractVersion } from "#contracts";
import type {
  CapabilityClaim,
  CapabilityConstraint,
  CapabilityRequirement,
  PortableImplementationId,
} from "#contracts";
import type { ModelProfile } from "./profile";
import type { DeploymentRef, ModelRef, ProviderRef } from "./references";

/**
 * Deterministic model resolution (ADR-004).
 *
 * Resolution accepts selection intent, required capabilities, caller/composition
 * bindings and policy constraints, and returns the selected binding with resolved
 * references, the profile/evidence, and diagnostics. It never reads environment
 * credentials, never silently downgrades a capability, and never falls back to a
 * first-list default: an unresolved tie fails as ambiguous, zero eligible
 * bindings fails explicitly, and every unproven requirement fails closed.
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

/**
 * Proves that a binding's supported claim satisfies a required constraint.
 *
 * The resolver cannot infer arbitrary constraint semantics, so proving them is
 * the caller/composition's responsibility. Absent an evaluator, required
 * constraints fail closed.
 */
export type ConstraintEvaluator = (input: {
  readonly binding: ModelBinding;
  readonly claim: CapabilityClaim;
  readonly requirement: CapabilityRequirement;
  readonly constraint: CapabilityConstraint;
}) => boolean;

/** Composition-owned policy. The default model is honored only when named. */
export interface ModelResolutionPolicy {
  readonly defaultModel?: ModelRef;
}

export interface ModelResolutionRequest {
  readonly selection?: ModelRef;
  readonly requiredCapabilities?: readonly CapabilityRequirement[];
  readonly bindings: readonly ModelBinding[];
  readonly policy?: ModelResolutionPolicy;
  readonly constraintEvaluator?: ConstraintEvaluator;
}

export type ResolutionMatch = "exact" | "alias" | "default";

export type ResolutionDiagnosticCode =
  | "selected-exact"
  | "selected-alias"
  | "selected-default"
  | "excluded-capability"
  | "binding-profile-mismatch"
  | "unsupported-version-range"
  | "unproven-constraint"
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

type RangeResult = "any" | "exact-match" | "exact-mismatch" | "unsupported";

// P0 supports an absent/`*` range or an exact SemVer only. A range operator
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

/** Per-binding evaluation state, bundled to keep helper arity within limits. */
interface BindingEvalContext {
  binding: ModelBinding;
  evaluator?: ConstraintEvaluator;
  diagnostics: ResolutionDiagnostic[];
}

const findSupportedClaim = (
  context: BindingEvalContext,
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
  context: BindingEvalContext,
  requirement: CapabilityRequirement,
  claim: CapabilityClaim,
): boolean => {
  const constraints = requirement.constraints ?? [];
  if (constraints.length === 0) {
    return true;
  }
  const { binding, evaluator, diagnostics } = context;
  if (!evaluator) {
    diagnostics.push({
      code: "unproven-constraint",
      message: `requirement ${requirement.capabilityId} carries constraints but no evaluator was provided`,
      bindingId: binding.bindingId,
    });
    return false;
  }
  const proven = constraints.every((constraint) =>
    evaluator({ binding, claim, requirement, constraint }),
  );
  if (!proven) {
    diagnostics.push({
      code: "unproven-constraint",
      message: `binding ${binding.bindingId} does not satisfy constraints for ${requirement.capabilityId}`,
      bindingId: binding.bindingId,
    });
  }
  return proven;
};

const bindingSatisfies = (
  context: BindingEvalContext,
  requirements: readonly CapabilityRequirement[],
): boolean => {
  const { binding, diagnostics } = context;
  if (!profileMatchesBinding(binding)) {
    diagnostics.push({
      code: "binding-profile-mismatch",
      message: `binding ${binding.bindingId} references a profile whose model/provider/deployment differ from the binding`,
      bindingId: binding.bindingId,
    });
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

export const createModelResolver = (): ModelResolver => ({
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
      bindingSatisfies(
        { binding, evaluator: request.constraintEvaluator, diagnostics },
        requirements,
      ),
    );
    const [binding, ...rest] = eligible;
    if (!binding) {
      diagnostics.push({
        code: "no-eligible-binding",
        message: `all matches for ${target} were excluded by required capabilities`,
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
