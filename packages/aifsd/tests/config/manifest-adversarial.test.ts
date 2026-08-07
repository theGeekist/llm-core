import { describe, expect, test } from "bun:test";
import { secretRef } from "@geekist/llm-core/contracts";

import { validateManifest } from "../../src/config/index.js";
import { createManifest } from "./fixtures/configuration.js";

const validateSafely = (input: unknown) => {
  let result: ReturnType<typeof validateManifest> | undefined;
  expect(() => {
    result = validateManifest(input);
  }).not.toThrow();
  expect(result?.ok).toBe(false);
  return result;
};

describe("adversarial manifest validation", () => {
  test.each([
    ["null settings", { settings: null }],
    ["array settings", { settings: [] }],
    ["null secrets", { secrets: null }],
    ["array secrets", { secrets: [] }],
  ])("rejects malformed selection records: %s", (_label, replacement) => {
    const manifest = createManifest();
    validateSafely({
      ...manifest,
      selections: [{ ...manifest.selections[0], ...replacement }, manifest.selections[1]],
    });
  });

  test("rejects a non-array environment selection overlay", () => {
    const manifest = createManifest();
    validateSafely({
      ...manifest,
      environments: { local: { selections: manifest.selections[0] } },
    });
  });

  test("rejects duplicate selection coordinates in the base manifest", () => {
    const manifest = createManifest();
    validateSafely({
      ...manifest,
      selections: [manifest.selections[0], { ...manifest.selections[0] }, manifest.selections[1]],
    });
  });

  test("rejects duplicate selection coordinates within one environment overlay", () => {
    const manifest = createManifest();
    const overlay = manifest.environments!.local!.selections![0]!;
    validateSafely({
      ...manifest,
      environments: {
        ...manifest.environments,
        local: { selections: [overlay, { ...overlay }] },
      },
    });
  });

  test.each([
    null,
    "trusted",
    { minimum: "unknown" },
    { minimum: "verified", explanation: "extra authority" },
  ])("rejects an invalid or open trust requirement %#", (trust) => {
    const manifest = createManifest();
    validateSafely({
      ...manifest,
      selections: [{ ...manifest.selections[0], trust }, manifest.selections[1]],
    });
  });

  test.each([
    { provider: { apiKey: "credential-sentinel-nested" } },
    { providers: [{ password: "credential-sentinel-array" }] },
  ])("rejects nested raw secret-shaped settings without echoing values %#", (settings) => {
    const manifest = createManifest();
    const result = validateSafely({
      ...manifest,
      selections: [{ ...manifest.selections[0], settings }, manifest.selections[1]],
    });

    if (result && !result.ok) {
      const diagnostics = JSON.stringify(result.diagnostics);
      expect(diagnostics).not.toContain("credential-sentinel-nested");
      expect(diagnostics).not.toContain("credential-sentinel-array");
    }
  });

  test.each([
    {
      key: "apiKey",
      value: { nested: "composite-object-sentinel" },
      leakedValue: "composite-object-sentinel",
    },
    {
      key: "accessToken",
      value: ["composite-array-sentinel"],
      leakedValue: "composite-array-sentinel",
    },
    { key: "password", value: 8675309, leakedValue: "8675309" },
  ])(
    "rejects a composite or numeric value under secret-shaped $key",
    ({ key, value, leakedValue }) => {
      const manifest = createManifest();
      const result = validateSafely({
        ...manifest,
        selections: [
          { ...manifest.selections[0], settings: { [key]: value } },
          manifest.selections[1],
        ],
      });

      if (result && !result.ok) {
        expect(JSON.stringify(result.diagnostics)).not.toContain(leakedValue);
      }
    },
  );

  test("accepts a benign numeric token budget setting", () => {
    const manifest = createManifest();
    const result = validateManifest({
      ...manifest,
      selections: [
        { ...manifest.selections[0], settings: { tokenBudget: 4096 } },
        manifest.selections[1],
      ],
    });

    expect(result.ok).toBe(true);
  });

  test.each([
    { provider: { credential: secretRef("fixture/nested-secret") } },
    { providers: [secretRef("fixture/array-secret")] },
  ])("rejects nested SecretRef values smuggled through settings %#", (settings) => {
    const manifest = createManifest();
    validateSafely({
      ...manifest,
      selections: [{ ...manifest.selections[0], settings }, manifest.selections[1]],
    });
  });
});
