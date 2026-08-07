import { describe, expect, test } from "bun:test";

import { validateManifest } from "../../src/config/index.js";
import { createManifest } from "./fixtures/configuration.js";

const expectRejected = (input: unknown) => {
  const result = validateManifest(input);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.diagnostics.length).toBeGreaterThan(0);
  }
};

describe("portable configuration boundary", () => {
  test.each([
    undefined,
    () => "live code",
    Symbol("live"),
    1n,
    new Date("2026-08-06T00:00:00.000Z"),
    new (class LiveConfiguration {})(),
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects a non-portable root value %#", expectRejected);

  test("rejects cycles, sparse arrays and symbol-keyed records", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    const sparse = new Array(2);
    sparse[1] = "present";

    for (const input of [cyclic, sparse, { [Symbol("hidden")]: "value" }]) {
      expectRejected(input);
    }
  });

  test("rejects accessors without invoking them", () => {
    let reads = 0;
    const accessor = Object.defineProperty({}, "schemaVersion", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "1";
      },
    });

    expectRejected(accessor);
    expect(reads).toBe(0);
  });

  test("normalises hostile and revoked proxy traps to diagnostics", () => {
    const throwingProxy = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error("hostile prototype trap");
        },
      },
    );
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    expectRejected(throwingProxy);
    expectRejected(proxy);
  });

  test("rejects unknown keys at closed manifest boundaries", () => {
    const manifest = createManifest();
    expectRejected({ ...manifest, executor: "native-node" });
    expectRejected({
      ...manifest,
      intent: { ...manifest.intent, callback: "hidden" },
    });
    expectRejected({
      ...manifest,
      selections: [{ ...manifest.selections[0], load: "./integration.mjs" }],
    });
  });

  test("rejects raw secrets while accepting opaque secret references", () => {
    const manifest = createManifest();
    expect(validateManifest(manifest).ok).toBe(true);
    const rawSecret = validateManifest({
      ...manifest,
      selections: [
        {
          ...manifest.selections[0],
          secrets: { applicationKey: "sk-live-raw-secret" },
        },
      ],
    });
    expect(rawSecret.ok).toBe(false);
    if (!rawSecret.ok) {
      expect(rawSecret.diagnostics.some((diagnostic) => diagnostic.code === "raw-secret")).toBe(
        true,
      );
      expect(JSON.stringify(rawSecret.diagnostics)).not.toContain("sk-live-raw-secret");
    }

    const secretInSettings = validateManifest({
      ...manifest,
      selections: [
        {
          ...manifest.selections[0],
          settings: { apiKey: "sk-live-raw-secret" },
        },
      ],
    });
    expect(secretInSettings.ok).toBe(false);
    if (!secretInSettings.ok) {
      expect(
        secretInSettings.diagnostics.some((diagnostic) => diagnostic.code === "raw-secret"),
      ).toBe(true);
    }
  });

  test("rejects hostile values nested in otherwise valid configuration", () => {
    const manifest = createManifest();
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    for (const value of [undefined, new Date(), () => "live", cyclic]) {
      expectRejected({
        ...manifest,
        selections: [{ ...manifest.selections[0], settings: { hostile: value } }],
      });
    }
  });

  test("does not invoke a nested accessor while producing diagnostics", () => {
    let reads = 0;
    const manifest = createManifest();
    const intent = Object.defineProperty({ outcomes: manifest.intent.outcomes }, "summary", {
      enumerable: true,
      get: () => {
        reads += 1;
        return manifest.intent.summary;
      },
    });

    expectRejected({ ...manifest, intent });
    expect(reads).toBe(0);
  });

  test("rejects an environment overlay that weakens a trust requirement", () => {
    const manifest = createManifest();
    const baseSelection = { ...manifest.selections[0]!, trust: { minimum: "official" as const } };
    const result = validateManifest({
      ...manifest,
      selections: [baseSelection, manifest.selections[1]],
      environments: {
        local: {
          selections: [{ ...baseSelection, trust: { minimum: "verified" } }],
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.diagnostics.some((diagnostic) => diagnostic.code === "unverified-integrity"),
      ).toBe(true);
    }
  });
});
