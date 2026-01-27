import type { AdapterDiagnostic } from "../types";
import type {
  AdapterConstructName,
  AdapterProviderRegistration,
  ConstructRequirement,
} from "../registry";
import { registryDiagnostic } from "./diagnostics";

export const toRequirementMap = (requirements: ConstructRequirement[]) => {
  const map = new Map<AdapterConstructName, ConstructRequirement>();
  for (const requirement of requirements) {
    if (!map.has(requirement.name)) {
      map.set(requirement.name, requirement);
    }
  }
  return map;
};

export const createReporters = (requirement: ConstructRequirement) => {
  const required = requirement.required ?? false;
  const level = required ? "error" : "warn";
  const diagnostics: AdapterDiagnostic[] = [];
  const report = (code: string, data?: Record<string, unknown>) => {
    diagnostics.push(registryDiagnostic(level, code, data));
  };
  const reportConflict = (entry: AdapterProviderRegistration) => {
    diagnostics.push(
      registryDiagnostic(level, "construct_provider_conflict", {
        construct: requirement.name,
        providerId: entry.id,
      }),
    );
  };
  return { diagnostics, report, reportConflict };
};
