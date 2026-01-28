import { describe, expect, it } from "bun:test";
import {
  createAdapterRegistry,
  createRegistryFromDefaults,
  type ConstructRequirement,
} from "#adapters";
import { assertSyncValue } from "./helpers";

const resolve = (
  registry: ReturnType<typeof createAdapterRegistry>,
  constructs: ConstructRequirement[],
  overrides?: Record<string, string>,
) => registry.resolve({ constructs, providers: overrides });

const CONSTRUCT_MODEL = "model";
const CONSTRUCT_TOOLS = "tools";
const DIAG_MISSING = "construct_provider_missing";
const DIAG_CONFLICT = "construct_provider_conflict";
const DIAG_CAPABILITY = "construct_capability_missing";
const DIAG_DEPENDENCY = "construct_dependency_missing";
const DIAG_NOT_FOUND = "construct_provider_not_found";
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

  it("registers constructs when providers are added", () => {
    const registry = createAdapterRegistry();
    registry.registerProvider({
      construct: "custom",
      providerKey: "test",
      id: "test:custom",
      factory: () => ({ ok: true }),
    });

    expect(registry.listConstructs().map((entry) => entry.name)).toContain("custom");
  });

  it("warns when registering duplicate constructs", () => {
    const registry = createAdapterRegistry();
    registry.registerConstruct({ name: CONSTRUCT_MODEL });
    registry.registerConstruct({ name: CONSTRUCT_MODEL });

    expect(registry.snapshot().diagnostics[0]?.message).toBe("construct_contract_conflict");
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

  it("reports missing capability for explicit provider override", () => {
    const registry = createAdapterRegistry();
    registry.registerProvider({
      construct: CONSTRUCT_MODEL,
      providerKey: "test",
      id: PROVIDER_TEST_MODEL,
      capabilities: ["json_schema"],
      factory: () => ({ generate: () => ({ text: "ok" }) }),
    });

    const result = assertSyncValue(
      resolve(registry, [{ name: CONSTRUCT_MODEL, required: false, capabilities: ["tools"] }], {
        model: PROVIDER_TEST_MODEL,
      }),
    );

    expect(result.diagnostics[0]?.message).toBe(DIAG_CAPABILITY);
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

  it("honors override registrations for providers", () => {
    const registry = createAdapterRegistry();
    registry.registerProvider({
      construct: CONSTRUCT_MODEL,
      providerKey: "test",
      id: PROVIDER_TEST_MODEL,
      factory: () => ({ generate: () => ({ text: "base" }) }),
    });
    registry.registerProvider({
      construct: CONSTRUCT_MODEL,
      providerKey: "test",
      id: PROVIDER_TEST_MODEL,
      override: true,
      factory: () => ({ generate: () => ({ text: "override" }) }),
    });

    const providers = registry.listProviders(CONSTRUCT_MODEL);
    expect(providers).toHaveLength(1);
    expect(providers[0]?.factory).toBeDefined();
  });

  it("reports provider id overrides that do not exist", () => {
    const registry = createAdapterRegistry();
    registry.registerConstruct({ name: CONSTRUCT_MODEL });
    const result = assertSyncValue(
      resolve(registry, [{ name: CONSTRUCT_MODEL, required: false }], {
        model: "missing-provider",
      }),
    );

    expect(result.diagnostics[0]?.message).toBe(DIAG_NOT_FOUND);
  });

  it("reports priority conflicts when ties occur", () => {
    const registry = createAdapterRegistry();
    registry.registerProvider({
      construct: CONSTRUCT_MODEL,
      providerKey: "test",
      id: "test:model:a",
      priority: 1,
      factory: () => ({ generate: () => ({ text: "a" }) }),
    });
    registry.registerProvider({
      construct: CONSTRUCT_MODEL,
      providerKey: "test",
      id: "test:model:b",
      priority: 1,
      factory: () => ({ generate: () => ({ text: "b" }) }),
    });

    const result = assertSyncValue(resolve(registry, [{ name: CONSTRUCT_MODEL }]));
    expect(result.diagnostics[0]?.message).toBe(DIAG_CONFLICT);
  });

  it("reports adapter dependency requirements", () => {
    const registry = createAdapterRegistry();
    registry.registerProvider({
      construct: "reranker",
      providerKey: "test",
      id: "test:reranker",
      factory: () => ({
        rerank: () => [],
        metadata: { requires: [{ kind: "construct", name: "retriever" }] },
      }),
    });
    const result = assertSyncValue(resolve(registry, [{ name: "reranker", required: false }]));
    expect(result.diagnostics[0]?.data).toMatchObject({
      code: DIAG_DEPENDENCY,
      construct: "reranker",
      missing: "retriever",
    });
  });

  it("warns on missing declared construct dependencies", () => {
    const registry = createAdapterRegistry();
    registry.registerProvider({
      construct: "reranker",
      providerKey: "test",
      id: "test:reranker",
      factory: () => ({ rerank: () => [] }),
    });

    const result = assertSyncValue(
      resolve(registry, [{ name: "reranker", required: false, dependsOn: ["retriever", "model"] }]),
    );

    expect(result.diagnostics[0]?.message).toBe(DIAG_DEPENDENCY);
  });

  it("handles adapter dependencies declared inside arrays", () => {
    const registry = createAdapterRegistry();
    registry.registerProvider({
      construct: "custom",
      providerKey: "test",
      id: "test:custom",
      factory: () => [
        {
          metadata: { requires: [{ kind: "construct", name: "retriever" }] },
        },
      ],
    });
    const result = assertSyncValue(resolve(registry, [{ name: "custom", required: false }]));
    expect(result.diagnostics[0]?.data).toMatchObject({
      code: DIAG_DEPENDENCY,
      construct: "custom",
      missing: "retriever",
    });
  });

  it("ignores metadata requirements on document lists", () => {
    const registry = createAdapterRegistry();
    registry.registerProvider({
      construct: "documents",
      providerKey: "test",
      id: "test:documents",
      factory: () => [
        {
          text: "hello",
          metadata: { requires: [{ kind: "construct", name: "retriever" }] },
        },
      ],
    });
    const result = assertSyncValue(resolve(registry, [{ name: "documents", required: false }]));
    expect(result.diagnostics).toBeArrayOfSize(0);
  });
});
