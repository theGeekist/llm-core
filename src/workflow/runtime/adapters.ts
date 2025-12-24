import type { AdapterBundle } from "../../adapters/types";
import type { DiagnosticEntry } from "../diagnostics";
import type { RecipeContract } from "../types";
import { applyAdapterPresence } from "../capabilities";
import { isCapabilitySatisfied } from "../capability-checks";
import { createContractDiagnostic } from "../diagnostics";

export const applyAdapterOverrides = (resolved: AdapterBundle, overrides?: AdapterBundle) => {
  if (!overrides) {
    return resolved;
  }
  return {
    ...resolved,
    ...overrides,
    constructs: {
      ...(resolved.constructs ?? {}),
      ...(overrides.constructs ?? {}),
    },
  };
};

export const toResolvedAdapters = (resolution: {
  adapters: AdapterBundle;
  constructs: Record<string, unknown>;
}): AdapterBundle => ({
  ...resolution.adapters,
  constructs: {
    ...(resolution.adapters.constructs ?? {}),
    ...resolution.constructs,
  },
});

export const buildResolvedCapabilities = (
  declaredCapabilities: Record<string, unknown>,
  adapters: AdapterBundle,
) => {
  const runtimeCapabilities: Record<string, unknown> = { ...declaredCapabilities };
  applyAdapterPresence(runtimeCapabilities, adapters);
  return runtimeCapabilities;
};

export const readContractDiagnostics = (
  declaredCapabilities: Record<string, unknown>,
  contract: RecipeContract,
  adapters: AdapterBundle,
): DiagnosticEntry[] => {
  const runtimeCapabilities = buildResolvedCapabilities(declaredCapabilities, adapters);
  return contract.minimumCapabilities.flatMap((minimum) =>
    isCapabilitySatisfied(runtimeCapabilities[minimum])
      ? []
      : [createContractDiagnostic(`Recipe "${contract.name}" requires capability "${minimum}".`)],
  );
};
