import { describe, expect, it } from "bun:test";
import type { AdapterBundle } from "#adapters";
import {
  adapterBundleCatalogue,
  adapterBundleKeys,
  mergeAdapterBundles,
  type AdapterBundleKey,
} from "../../src/adapters/bundle";
import { readAdapterRequirements } from "../../src/adapters/requirements";
import { collectAdapters, createRegistryFromPlugins } from "../../src/workflow/adapters";
import { buildCapabilities } from "../../src/workflow/capabilities";
import type { Plugin } from "../../src/workflow/types";
import { assertSyncValue } from "./helpers";

const expectedKeys = [
  "cache",
  "documents",
  "embedder",
  "eventStream",
  "image",
  "indexing",
  "interrupt",
  "kv",
  "loader",
  "memory",
  "messages",
  "model",
  "outputParser",
  "prompts",
  "queryEngine",
  "reranker",
  "responseSynthesizer",
  "retriever",
  "schemas",
  "skills",
  "speech",
  "storage",
  "textSplitter",
  "tools",
  "trace",
  "transcription",
  "transformer",
  "vectorStore",
] as const satisfies readonly AdapterBundleKey[];

const buildBundle = (label: string): AdapterBundle =>
  Object.fromEntries(
    adapterBundleKeys.map((key) => [
      key,
      adapterBundleCatalogue[key].merge === "append"
        ? [{ label: `${label}:${key}` }]
        : { label: `${label}:${key}` },
    ]),
  ) as AdapterBundle;

describe("Adapter bundle catalogue", () => {
  it("describes every first-class bundle key exactly once", () => {
    expect([...adapterBundleKeys].sort()).toEqual([...expectedKeys].sort());
  });

  it("drives append and replacement merge behavior for every key", () => {
    const base = { ...buildBundle("base"), constructs: { base: true } };
    const next = { ...buildBundle("next"), constructs: { next: true } };
    const merged = mergeAdapterBundles(base, next) as Record<string, unknown>;

    for (const key of adapterBundleKeys) {
      if (adapterBundleCatalogue[key].merge === "append") {
        expect(merged[key]).toEqual([{ label: `base:${key}` }, { label: `next:${key}` }]);
      } else {
        expect(merged[key]).toEqual({ label: `next:${key}` });
      }
    }
    expect(merged.constructs).toEqual({ base: true, next: true });
  });

  it("registers and resolves every first-class adapter key", () => {
    const bundle = buildBundle("registered");
    const registry = createRegistryFromPlugins([{ key: "all", adapters: bundle }]);
    const result = assertSyncValue(
      registry.resolve({
        constructs: adapterBundleKeys.map((name) => ({ name })),
      }),
    );

    for (const key of adapterBundleKeys) {
      expect(result.adapters[key]).toBe(bundle[key]);
      expect(result.providers[key]).toBe(`all:${key}`);
    }
  });

  it("derives a capability for every populated adapter key", () => {
    const bundle = buildBundle("capability");
    const snapshot = buildCapabilities([{ key: "all", adapters: bundle }]);

    for (const key of adapterBundleKeys) {
      const expected = adapterBundleCatalogue[key].capability === "presence" ? true : bundle[key];
      expect(snapshot.declared[key]).toBe(expected);
      expect(snapshot.resolved[key]).toBe(expected);
    }
  });

  it("reads requirements from every adapter-valued construct", () => {
    const requiredKeys = adapterBundleKeys.filter(
      (key) => adapterBundleCatalogue[key].readsRequirements,
    );
    const bundle = Object.fromEntries(
      requiredKeys.map((key) => [
        key,
        {
          metadata: {
            requires: [{ kind: "construct", name: "missing" }],
          },
        },
      ]),
    ) as AdapterBundle;

    expect(
      readAdapterRequirements(bundle, {}, {})
        .map(({ construct }) => construct)
        .sort(),
    ).toEqual([...requiredKeys].sort());
  });

  it("does not discard unrelated adapters when an override follows them", () => {
    const cache = { get: () => null, set: () => null, delete: () => null };
    const baseModel = { generate: () => ({ text: "base" }) };
    const overrideModel = { generate: () => ({ text: "override" }) };
    const plugins: Plugin[] = [
      { key: "cache", adapters: { cache } },
      { key: "model", adapters: { model: baseModel } },
      {
        key: "model.override",
        mode: "override",
        overrideKey: "model",
        adapters: { model: overrideModel },
      },
    ];

    expect(collectAdapters(plugins)).toMatchObject({
      cache,
      model: overrideModel,
    });
  });
});
