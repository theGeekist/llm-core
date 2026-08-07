import { describe, expect, test } from "bun:test";

import { validateManifest } from "../../src/config/index.js";
import { createManifest } from "./fixtures/configuration.js";

const withSetting = (key: string, value: unknown) => {
  const manifest = createManifest();
  return validateManifest({
    ...manifest,
    selections: [{ ...manifest.selections[0], settings: { [key]: value } }, manifest.selections[1]],
  });
};

describe("portable-boundary regressions", () => {
  test("maps strict JSON failures into stable AIFSD diagnostics", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const customArray = [createManifest()];
    Object.setPrototypeOf(customArray, Object.create(Array.prototype));

    for (const input of [cyclic, customArray]) {
      const result = validateManifest(input);
      expect(result).toEqual({
        ok: false,
        diagnostics: [{ code: "live-object", reasonCode: "live-object", path: "" }],
      });
    }

    const invalidNumber = validateManifest(Number.NaN);
    expect(invalidNumber).toEqual({
      ok: false,
      diagnostics: [{ code: "non-portable-value", reasonCode: "invalid-portable-value", path: "" }],
    });
    expect(validateManifest(undefined)).toEqual({
      ok: false,
      diagnostics: [{ code: "undefined-value", reasonCode: "undefined-value", path: "" }],
    });
  });

  test("accepts a detached null-prototype manifest", () => {
    const manifest = Object.assign(
      Object.create(null) as Record<string, unknown>,
      createManifest(),
    );

    const result = validateManifest(manifest);

    expect(result.ok).toBe(true);
  });

  test("returns renderer-neutral diagnostics for unexpected fields", () => {
    const result = validateManifest({ ...createManifest(), ambient: "host-owned" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics).toContainEqual({
        code: "unknown-field",
        reasonCode: "unexpected-field",
        path: "/ambient",
      });
      for (const diagnostic of result.diagnostics) {
        expect(Object.keys(diagnostic).sort()).toEqual(["code", "path", "reasonCode"]);
      }
    }
  });

  test("contains hostile thrown values without coercing them", () => {
    let coercions = 0;
    const hostileError = {
      [Symbol.toPrimitive]: () => {
        coercions += 1;
        throw new Error("coercion must not run");
      },
      toString: () => {
        coercions += 1;
        throw new Error("stringification must not run");
      },
    };
    const hostileInput = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw hostileError;
        },
      },
    );

    let result: ReturnType<typeof validateManifest> | undefined;
    expect(() => {
      result = validateManifest(hostileInput);
    }).not.toThrow();
    expect(result?.ok).toBe(false);
    expect(coercions).toBe(0);
    if (result && !result.ok) {
      expect(result.diagnostics).toContainEqual({
        code: "non-portable-value",
        reasonCode: "invalid-portable-value",
        path: "",
      });
    }
  });

  test.each(["passphrase", "privateKeyPem", "authorization", "connectionString"])(
    "rejects credential-shaped setting key %s without echoing its value",
    (key) => {
      const secret = `credential-sentinel-${key}`;
      const result = withSetting(key, secret);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics).toContainEqual({
          code: "raw-secret",
          reasonCode: "credential-shaped-setting",
          path: `/selections/0/settings/${key}`,
        });
        expect(JSON.stringify(result.diagnostics)).not.toContain(secret);
      }
    },
  );

  test.each(["2.0.0", "999.0.0", "not-semver", 1])(
    "rejects unsupported or malformed schema version %#",
    (schemaVersion) => {
      const result = validateManifest({ ...createManifest(), schemaVersion });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics).toContainEqual({
          code: "unsupported-version",
          reasonCode: "unsupported-schema-version",
          path: "/schemaVersion",
        });
      }
    },
  );
});
