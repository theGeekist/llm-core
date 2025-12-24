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

const selectById = (
  requirement: ConstructRequirement,
  entries: AdapterProviderRegistration[],
  providerId: string,
  report: (code: string, data?: Record<string, unknown>) => void,
) => {
  const selected = entries.find((entry) => entry.id === providerId);
  if (!selected) {
    report("construct_provider_not_found", { construct: requirement.name, providerId });
  }
  return selected;
};

const selectByPriority = (
  requirement: ConstructRequirement,
  entries: AdapterProviderRegistration[],
  report: (code: string, data?: Record<string, unknown>) => void,
  reportConflict: (entry: AdapterProviderRegistration) => void,
) => {
  const candidates = entries.filter((entry) =>
    hasCapabilities(requirement.capabilities, entry.capabilities),
  );
  if (candidates.length === 0) {
    if (entries.length > 0 && requirement.capabilities?.length) {
      report("construct_capability_missing", {
        construct: requirement.name,
        missing: requirement.capabilities,
      });
    } else {
      report("construct_provider_missing", { construct: requirement.name });
    }
    return undefined;
  }
  const selected = pickHighestPriority(candidates);
  if (!selected) {
    report("construct_provider_missing", { construct: requirement.name });
    return undefined;
  }
  if (hasPriorityConflict(candidates, selected)) {
    reportConflict(selected);
  }
  return selected;
};

export const validateCapabilities = (
  requirement: ConstructRequirement,
  selected: AdapterProviderRegistration | undefined,
  report: (code: string, data?: Record<string, unknown>) => void,
) => {
  if (!selected) {
    return undefined;
  }
  if (hasCapabilities(requirement.capabilities, selected.capabilities)) {
    return selected;
  }
  report("construct_capability_missing", {
    construct: requirement.name,
    providerId: selected.id,
    missing: requirement.capabilities ?? [],
  });
  return undefined;
};

export const resolveProviderSelection = (
  requirement: ConstructRequirement,
  entries: AdapterProviderRegistration[],
  overrides: Record<string, string>,
  defaults: Record<string, string>,
  report: (code: string, data?: Record<string, unknown>) => void,
  reportConflict: (entry: AdapterProviderRegistration) => void,
) => {
  const providerId = overrides[requirement.name] ?? defaults[requirement.name];
  const selected = providerId
    ? selectById(requirement, entries, providerId, report)
    : selectByPriority(requirement, entries, report, reportConflict);
  return { selected, providerId };
};
