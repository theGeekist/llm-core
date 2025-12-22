import { describe, expect, it } from "bun:test";
import {
  createAdapterRegistry,
  createRegistryFromDefaults,
  type AdapterConstructRequirement,
} from "#adapters";
import { assertSyncValue } from "./helpers";

const resolve = (
  registry: ReturnType<typeof createAdapterRegistry>,
  constructs: AdapterConstructRequirement[],
  overrides?: Record<string, string>,
) => registry.resolve({ constructs, providers: overrides });

const CONSTRUCT_MODEL = "model";
const CONSTRUCT_TOOLS = "tools";
const DIAG_MISSING = "construct_provider_missing";
const DIAG_CONFLICT = "construct_provider_conflict";
const DIAG_CAPABILITY = "construct_capability_missing";
const PROVIDER_TEST_MODEL = "test:model";
const PROVIDER_CUSTOM_TOOLS = "custom:tools";

describe("Adapter registry", () => {
  it("resolves builtin providers by default", () => {
    const registry = createRegistryFromDefaults();
    const result = assertSyncValue(
      resolve(registry, [
        { name: CONSTRUCT_MODEL, required: true },
        { name: CONSTRUCT_TOOLS, required: true },
      ]),
    );
    expect(result.adapters.model).toBeDefined();
    expect(result.adapters.tools).toBeDefined();
    expect(result.providers.model).toBe("builtin:model");
    expect(result.providers.tools).toBe("builtin:tools");
  });

  it("prefers higher priority providers", () => {
    const registry = createRegistryFromDefaults();
    registry.registerProvider({
      construct: CONSTRUCT_MODEL,
      providerKey: "test",
      id: PROVIDER_TEST_MODEL,
      priority: 10,
      factory: () => ({ generate: () => ({ text: "ok" }) }),
    });
    const result = assertSyncValue(resolve(registry, [{ name: CONSTRUCT_MODEL, required: true }]));
    expect(result.providers.model).toBe(PROVIDER_TEST_MODEL);
  });

  it("honors explicit provider overrides", () => {
    const registry = createRegistryFromDefaults();
    registry.registerProvider({
      construct: CONSTRUCT_TOOLS,
      providerKey: "custom",
      id: PROVIDER_CUSTOM_TOOLS,
      priority: 10,
      factory: () => [{ name: "custom" }],
    });
    const result = assertSyncValue(
      resolve(registry, [{ name: CONSTRUCT_TOOLS, required: true }], {
        tools: PROVIDER_CUSTOM_TOOLS,
      }),
    );
    expect(result.providers.tools).toBe(PROVIDER_CUSTOM_TOOLS);
    expect(result.adapters.tools).toEqual([{ name: "custom" }]);
  });

  it("reports missing providers for required constructs", () => {
    const registry = createAdapterRegistry();
    registry.registerConstruct({ name: CONSTRUCT_MODEL });
    const result = assertSyncValue(resolve(registry, [{ name: CONSTRUCT_MODEL, required: true }]));
    expect(result.diagnostics[0]?.message).toBe(DIAG_MISSING);
    expect(result.diagnostics[0]?.level).toBe("error");
  });

  it("reports capability mismatches", () => {
    const registry = createAdapterRegistry();
    registry.registerProvider({
      construct: CONSTRUCT_MODEL,
      providerKey: "test",
      id: PROVIDER_TEST_MODEL,
      capabilities: ["json_schema"],
      factory: () => ({ generate: () => ({ text: "ok" }) }),
    });
    const result = assertSyncValue(
      resolve(registry, [{ name: CONSTRUCT_MODEL, required: true, capabilities: ["tools"] }]),
    );
    expect(result.diagnostics[0]?.message).toBe(DIAG_CAPABILITY);
    expect(result.diagnostics[0]?.level).toBe("error");
  });

  it("tracks duplicate provider registration conflicts", () => {
    const registry = createAdapterRegistry();
    registry.registerProvider({
      construct: CONSTRUCT_MODEL,
      providerKey: "test",
      id: PROVIDER_TEST_MODEL,
      factory: () => ({ generate: () => ({ text: "ok" }) }),
    });
    registry.registerProvider({
      construct: CONSTRUCT_MODEL,
      providerKey: "test",
      id: "test:model",
      factory: () => ({ generate: () => ({ text: "ok" }) }),
    });
    const result = assertSyncValue(resolve(registry, [{ name: CONSTRUCT_MODEL, required: false }]));
    expect(result.diagnostics[0]?.message).toBe(DIAG_CONFLICT);
    expect(result.diagnostics[0]?.level).toBe("warn");
  });
});
