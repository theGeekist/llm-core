import { describe, expect, test } from "bun:test";

import { validateManifest } from "../../src/config/index.js";
import { createManifest } from "./fixtures/configuration.js";

const secretShapedKeys = [
  "secretKey",
  "accessKey",
  "privateKey",
  "encryptionKey",
  "signingKey",
  "apiKey",
];

const benignSettings = [
  ["tokenBudget", 4096],
  ["monkey", "capuchin"],
  ["keyboard", { layout: "dvorak" }],
  ["publicKey", "ssh-ed25519-public-material"],
] as const;

const validateWithSetting = (key: string, value: unknown) => {
  const manifest = createManifest();
  return validateManifest({
    ...manifest,
    selections: [{ ...manifest.selections[0], settings: { [key]: value } }, manifest.selections[1]],
  });
};

describe("secret-shaped settings key classification", () => {
  test.each(secretShapedKeys)("rejects scalar values under %s without echoing them", (key) => {
    const secretValue = `scalar-${key}-credential-sentinel`;
    const result = validateWithSetting(key, secretValue);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics).toContainEqual({
        code: "raw-secret",
        reasonCode: "credential-shaped-setting",
        path: `/selections/0/settings/${key}`,
      });
      expect(JSON.stringify(result.diagnostics)).not.toContain(secretValue);
    }
  });

  test.each(secretShapedKeys)(
    "rejects composite values under %s without echoing nested content",
    (key) => {
      const secretValue = `composite-${key}-credential-sentinel`;
      const result = validateWithSetting(key, {
        wrapped: [{ credential: secretValue }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics).toContainEqual({
          code: "raw-secret",
          reasonCode: "credential-shaped-setting",
          path: `/selections/0/settings/${key}`,
        });
        expect(JSON.stringify(result.diagnostics)).not.toContain(secretValue);
      }
    },
  );

  test.each(benignSettings)("accepts the benign setting key %s", (key, value) => {
    expect(validateWithSetting(key, value).ok).toBe(true);
  });
});
