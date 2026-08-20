import {
  registerCapabilityCandidate,
  resolveCapabilityCandidates,
  type AnyRegisteredCapabilityCandidate,
  type CapabilityCandidateDependencies,
  type CapabilityCandidateDescriptor,
  type CapabilityCandidateResolutionOutcome,
  type CapabilityCandidateResolutionRequest,
  type CapabilityPortKind,
  type RegisteredCapabilityCandidate,
} from "../../application/capability-bindings/public";

export interface CapabilityCandidateCatalog {
  register<TKind extends CapabilityPortKind>(
    candidate: CapabilityCandidateDescriptor<TKind>,
  ): RegisteredCapabilityCandidate<TKind>;
  list(): readonly AnyRegisteredCapabilityCandidate[];
  resolve(
    request: Omit<CapabilityCandidateResolutionRequest, "candidates">,
  ): CapabilityCandidateResolutionOutcome;
}

export const createCapabilityCandidateCatalog = (
  dependencies: CapabilityCandidateDependencies,
): CapabilityCandidateCatalog => {
  if (
    typeof dependencies?.verifyEvidence !== "function" ||
    typeof dependencies.verifyAcquisitionFactory !== "function" ||
    (dependencies.evaluateCondition !== undefined &&
      typeof dependencies.evaluateCondition !== "function")
  ) {
    throw new TypeError("Capability catalog requires explicit trusted verification ports.");
  }
  const trustedDependencies: CapabilityCandidateDependencies = Object.freeze({
    verifyEvidence: dependencies.verifyEvidence,
    verifyAcquisitionFactory: dependencies.verifyAcquisitionFactory,
    ...(dependencies.evaluateCondition === undefined
      ? {}
      : { evaluateCondition: dependencies.evaluateCondition }),
  });
  const candidates: AnyRegisteredCapabilityCandidate[] = [];
  const register = <TKind extends CapabilityPortKind>(
    candidate: CapabilityCandidateDescriptor<TKind>,
  ) => {
    const registered = registerCapabilityCandidate(candidate, trustedDependencies);
    if (
      candidates.some(
        (entry) =>
          entry.kind === registered.kind &&
          entry.descriptor.bindingId === registered.descriptor.bindingId,
      )
    ) {
      throw new TypeError("Capability catalogue cannot register a duplicate candidate identity.");
    }
    candidates.push(registered as AnyRegisteredCapabilityCandidate);
    return registered;
  };

  return Object.freeze({
    register,
    list: () =>
      Object.freeze(
        candidates
          .slice()
          .toSorted(
            (left, right) =>
              left.kind.localeCompare(right.kind) ||
              left.descriptor.bindingId.localeCompare(right.descriptor.bindingId),
          ),
      ),
    resolve: (request: Omit<CapabilityCandidateResolutionRequest, "candidates">) =>
      resolveCapabilityCandidates(
        {
          ...request,
          candidates: candidates.slice(),
        },
        { evaluateCondition: trustedDependencies.evaluateCondition },
      ),
  }) as CapabilityCandidateCatalog;
};
