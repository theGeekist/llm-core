import { describe, expect, test } from "bun:test";
import { secretRef, type JsonValue } from "#contracts";
import {
  jsonStorageValue,
  registerCacheRecord,
  registerStorageValue,
  resourceStorageValue,
} from "../../src/features/storage/public";
import { resource } from "./helpers";

describe("storage contracts", () => {
  test("registers deeply frozen closed JSON and resource values", () => {
    const source: { kind: "json"; value: { safe: string[] } } = {
      kind: "json",
      value: { safe: ["value"] },
    };
    const registered = registerStorageValue(source);
    source.value.safe.push("mutated");

    expect(registered).toEqual({ kind: "json", value: { safe: ["value"] } });
    expect(Object.isFrozen(registered)).toBe(true);
    expect(registered.kind).toBe("json");
    if (registered.kind === "json") {
      expect(Object.isFrozen(registered.value)).toBe(true);
    }
    expect(resourceStorageValue(resource)).toEqual({ kind: "resource", resource });
  });

  test("rejects bytes, locators, credentials and unknown fields", () => {
    expect(() =>
      registerStorageValue({ kind: "json", value: { ok: true }, signedUrl: "https://secret" }),
    ).toThrow();
    expect(() =>
      registerStorageValue({ kind: "resource", resource, path: "/private/data" }),
    ).toThrow();
    expect(() =>
      registerStorageValue({ kind: "json", value: new Uint8Array([1, 2, 3]) }),
    ).toThrow();
    expect(() =>
      registerStorageValue({ kind: "json", value: { credential: undefined } }),
    ).toThrow();
  });

  test("rejects recursive sensitive keys and values while preserving opaque references", () => {
    const unsafe: JsonValue[] = [
      { nested: { credential: "raw" } },
      { nested: { path: "/private/data" } },
      { nested: { signedUrl: "https://storage.invalid/file" } },
      { nested: { providerMetadata: { model: "native" } } },
      { nested: { apiKey: "raw" } },
      { nested: { accessToken: "raw" } },
      { safeKey: "/private/data" },
      { safeKey: "https://storage.invalid/file?token=secret" },
      { safeKey: "Bearer raw-secret" },
    ];
    for (const value of unsafe) {
      expect(() => jsonStorageValue(value)).toThrow();
    }

    expect(
      jsonStorageValue({
        authorization: secretRef("sk-reference-not-material"),
        resource,
      }),
    ).toEqual({
      kind: "json",
      value: {
        authorization: { secretId: "sk-reference-not-material" },
        resource,
      },
    });
  });

  test("keeps cache records portable and canonically timestamped", () => {
    const value = jsonStorageValue({ answer: 42 });
    const record = registerCacheRecord({
      value,
      expiresAt: "2026-07-29T10:30:00.000Z",
    });
    expect(record.value).toEqual(value);
    expect(() => registerCacheRecord({ value, expiresAt: "tomorrow" })).toThrow();
    expect(() => registerCacheRecord({ value, native: {} })).toThrow();
  });
});
