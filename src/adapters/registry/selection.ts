import type { AdapterProviderRegistration, ConstructRequirement } from "../registry";

const hasCapabilities = (required: string[] | undefined, available: string[] | undefined) => {
  if (!required || required.length === 0) {
    return true;
  }
  const set = new Set(available ?? []);
  return required.every((capability) => set.has(capability));
};

const pickHighestPriority = (providers: AdapterProviderRegistration[]) => {
  if (providers.length === 0) {
    return undefined;
  }
  const first = providers[0];
  if (!first) {
    return undefined;
  }
  let selected = first;
  let best = selected.priority ?? 0;
  for (const provider of providers.slice(1)) {
    const priority = provider.priority ?? 0;
    if (priority > best) {
      best = priority;
      selected = provider;
    }
  }
  return selected;
};

const hasPriorityConflict = (
  providers: AdapterProviderRegistration[],
  winner: AdapterProviderRegistration,
) => {
  const priority = winner.priority ?? 0;
  return providers.filter((provider) => (provider.priority ?? 0) === priority).length > 1;
};

type SelectByIdInput = {
  requirement: ConstructRequirement;
  entries: AdapterProviderRegistration[];
  providerId: string;
  report: (code: string, data?: Record<string, unknown>) => void;
};

const selectById = (input: SelectByIdInput) => {
  const selected = input.entries.find((entry) => entry.id === input.providerId);
  if (!selected) {
    input.report("construct_provider_not_found", {
      construct: input.requirement.name,
      providerId: input.providerId,
    });
  }
  return selected;
};

type SelectByPriorityInput = {
  requirement: ConstructRequirement;
  entries: AdapterProviderRegistration[];
  report: (code: string, data?: Record<string, unknown>) => void;
  reportConflict: (entry: AdapterProviderRegistration) => void;
};

const selectByPriority = (input: SelectByPriorityInput) => {
  const candidates = input.entries.filter((entry) =>
    hasCapabilities(input.requirement.capabilities, entry.capabilities),
  );
  if (candidates.length === 0) {
    if (input.entries.length > 0 && input.requirement.capabilities?.length) {
      input.report("construct_capability_missing", {
        construct: input.requirement.name,
        missing: input.requirement.capabilities,
      });
    } else {
      input.report("construct_provider_missing", { construct: input.requirement.name });
    }
    return undefined;
  }
  const selected = pickHighestPriority(candidates);
  if (!selected) {
    input.report("construct_provider_missing", { construct: input.requirement.name });
    return undefined;
  }
  if (hasPriorityConflict(candidates, selected)) {
    input.reportConflict(selected);
  }
  return selected;
};

type ValidateCapabilitiesInput = {
  requirement: ConstructRequirement;
  selected: AdapterProviderRegistration | undefined;
  report: (code: string, data?: Record<string, unknown>) => void;
};

export const validateCapabilities = (input: ValidateCapabilitiesInput) => {
  if (!input.selected) {
    return undefined;
  }
  if (hasCapabilities(input.requirement.capabilities, input.selected.capabilities)) {
    return input.selected;
  }
  input.report("construct_capability_missing", {
    construct: input.requirement.name,
    providerId: input.selected.id,
    missing: input.requirement.capabilities ?? [],
  });
  return undefined;
};

type ResolveProviderSelectionInput = {
  requirement: ConstructRequirement;
  entries: AdapterProviderRegistration[];
  overrides: Record<string, string>;
  defaults: Record<string, string>;
  report: (code: string, data?: Record<string, unknown>) => void;
  reportConflict: (entry: AdapterProviderRegistration) => void;
};

export const resolveProviderSelection = (input: ResolveProviderSelectionInput) => {
  const providerId =
    input.overrides[input.requirement.name] ?? input.defaults[input.requirement.name];
  const selected = providerId
    ? selectById({
        requirement: input.requirement,
        entries: input.entries,
        providerId,
        report: input.report,
      })
    : selectByPriority({
        requirement: input.requirement,
        entries: input.entries,
        report: input.report,
        reportConflict: input.reportConflict,
      });
  return { selected, providerId };
};
