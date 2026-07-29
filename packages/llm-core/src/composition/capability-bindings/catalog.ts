import {
  registerRuntimeCapabilityBinding,
  resolveCapabilityBindings,
  type AnyRegisteredRuntimeCapabilityBinding,
  type CapabilityBindingDependencies,
  type CapabilityBindingResolutionOutcome,
  type CapabilityBindingResolutionRequest,
  type CapabilityPortKind,
  type RegisteredRuntimeCapabilityBinding,
  type RuntimeCapabilityBinding,
} from "../../application/capability-bindings/public";

export interface CapabilityBindingCatalog {
  register<TKind extends CapabilityPortKind>(
    binding: RuntimeCapabilityBinding<TKind>,
  ): RegisteredRuntimeCapabilityBinding<TKind>;
  list(): readonly AnyRegisteredRuntimeCapabilityBinding[];
  resolve(
    request: Omit<CapabilityBindingResolutionRequest, "bindings">,
  ): CapabilityBindingResolutionOutcome;
}

export const createCapabilityBindingCatalog = (
  dependencies: CapabilityBindingDependencies,
): CapabilityBindingCatalog => {
  if (
    typeof dependencies?.verifyEvidence !== "function" ||
    (dependencies.evaluateCondition !== undefined &&
      typeof dependencies.evaluateCondition !== "function")
  ) {
    throw new TypeError("Capability catalog requires explicit trusted verification ports.");
  }
  const trustedDependencies: CapabilityBindingDependencies = Object.freeze({
    verifyEvidence: dependencies.verifyEvidence,
    ...(dependencies.evaluateCondition === undefined
      ? {}
      : { evaluateCondition: dependencies.evaluateCondition }),
  });
  const bindings: AnyRegisteredRuntimeCapabilityBinding[] = [];
  const register = <TKind extends CapabilityPortKind>(binding: RuntimeCapabilityBinding<TKind>) => {
    const registered = registerRuntimeCapabilityBinding(binding, trustedDependencies);
    if (
      bindings.some(
        (entry) =>
          entry.kind === registered.kind &&
          entry.descriptor.bindingId === registered.descriptor.bindingId,
      )
    ) {
      throw new TypeError("Capability catalog cannot register a duplicate binding identity.");
    }
    bindings.push(registered as AnyRegisteredRuntimeCapabilityBinding);
    return registered;
  };

  return Object.freeze({
    register,
    list: () =>
      Object.freeze(
        bindings
          .slice()
          .toSorted(
            (left, right) =>
              left.kind.localeCompare(right.kind) ||
              left.descriptor.bindingId.localeCompare(right.descriptor.bindingId),
          ),
      ),
    resolve: (request: Omit<CapabilityBindingResolutionRequest, "bindings">) =>
      resolveCapabilityBindings(
        {
          ...request,
          bindings: bindings.slice(),
        },
        { evaluateCondition: trustedDependencies.evaluateCondition },
      ),
  }) as CapabilityBindingCatalog;
};
