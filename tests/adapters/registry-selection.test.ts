import { describe, expect, it } from "bun:test";
import { createReporters } from "../../src/adapters/registry/requirements";
import {
  resolveProviderSelection,
  validateCapabilities,
} from "../../src/adapters/registry/selection";
import type {
  AdapterProviderRegistration,
  ConstructRequirement,
} from "../../src/adapters/registry";

describe("Adapter registry selection", () => {
  const CONSTRUCT = "tools";
  const CAPABILITY = "structured";
  const PROVIDER_ONE = "provider-1";
  const requirement: ConstructRequirement = {
    name: CONSTRUCT,
    capabilities: [CAPABILITY],
  };
  const providers: AdapterProviderRegistration[] = [
    {
      construct: CONSTRUCT,
      providerKey: "test",
      id: PROVIDER_ONE,
      priority: 0,
      capabilities: [CAPABILITY, "fast"],
      factory: () => ({}),
    },
  ];

  it("selects a provider by id override", () => {
    const { diagnostics, report, reportConflict } = createReporters(requirement);
    const selection = resolveProviderSelection({
      requirement,
      entries: providers,
      overrides: { [CONSTRUCT]: PROVIDER_ONE },
      defaults: {},
      report,
      reportConflict,
    });
    const validated = validateCapabilities({ requirement, selected: selection.selected, report });
    expect(validated?.id).toBe(PROVIDER_ONE);
    expect(diagnostics.length).toBe(0);
  });

  it("reports missing capabilities", () => {
    const { diagnostics, report, reportConflict } = createReporters(requirement);
    const selection = resolveProviderSelection({
      requirement,
      entries: [
        {
          construct: CONSTRUCT,
          providerKey: "test",
          id: "provider-2",
          priority: 0,
          capabilities: ["basic"],
          factory: () => ({}),
        },
      ],
      overrides: {},
      defaults: {},
      report,
      reportConflict,
    });
    const validated = validateCapabilities({ requirement, selected: selection.selected, report });
    expect(validated).toBeNull();
    expect(diagnostics.map((entry) => entry.message)).toContain("construct_capability_missing");
  });
});
