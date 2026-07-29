import type { CapabilityRequirement, PortableImplementationId } from "#contracts";
import type { ModelProfile } from "./profile";
import type { DeploymentRef, ModelRef, ProviderRef } from "./references";

/**
 * Deterministic model resolution (ADR-004).
 *
 * Resolution accepts selection intent, required capabilities, caller/composition
 * bindings and policy constraints, and returns the selected binding with resolved
 * references, the profile/evidence, and diagnostics. It never reads environment
 * credentials, never silently downgrades a capability, and never falls back to a
 * first-list default: an unresolved tie fails as ambiguous and zero eligible
 * bindings fails explicitly.
 */

/** One configured implementation eligible to satisfy a selection. */
export interface ModelBinding {
  bindingId: PortableImplementationId;
  model: ModelRef;
  provider: ProviderRef;
  deployment: DeploymentRef;
  profile: ModelProfile;
  /** Policy aliases that also select this binding. Exact model match wins. */
  aliases?: ModelRef[];
}

/** Composition-owned policy. The default model is honored only when named. */
export interface ModelResolutionPolicy {
  defaultModel?: ModelRef;
}

export interface ModelResolutionRequest {
  selection?: ModelRef;
  requiredCapabilities?: CapabilityRequirement[];
  bindings: ModelBinding[];
  policy?: ModelResolutionPolicy;
}

export type ResolutionMatch = "exact" | "alias" | "default";

export type ResolutionDiagnosticCode =
  | "selected-exact"
  | "selected-alias"
  | "selected-default"
  | "excluded-capability"
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

const versionSatisfied = (range: string | undefined, version: string): boolean => {
  if (range === undefined || range === "" || range === "*") {
    return true;
  }
  // P0 supports exact-version matching only; richer range semantics are deferred.
  return range === version;
};

const bindingSatisfies = (
  binding: ModelBinding,
  requirements: CapabilityRequirement[],
  diagnostics: ResolutionDiagnostic[],
): boolean => {
  for (const requirement of requirements) {
    if (requirement.required === false) {
      continue;
    }
    const met = binding.profile.claims.some(
      (claim) =>
        claim.status === "supported" &&
        claim.capabilityId === requirement.capabilityId &&
        versionSatisfied(requirement.versionRange, claim.version),
    );
    if (!met) {
      diagnostics.push({
        code: "excluded-capability",
        message: `binding lacks a supported claim for ${requirement.capabilityId}`,
        bindingId: binding.bindingId,
      });
      return false;
    }
  }
  return true;
};

const selectTier = (
  bindings: ModelBinding[],
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
      bindingSatisfies(binding, requirements, diagnostics),
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
