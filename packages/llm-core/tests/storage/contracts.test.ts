import { describe, expect, test } from "bun:test";
import { secretRef, type JsonValue } from "#contracts";
import {
  jsonStorageValue,
  registerCacheRecord,
  registerStorageValue,
  resourceStorageValue,
} from "../../src/features/storage/public";
import { resource } from "./storage-fixtures";

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
    const unsafeKeys: JsonValue[] = [
      { nested: { credential: "placeholder" } },
      { nested: { path: "placeholder" } },
      { nested: { signedUrl: "placeholder" } },
      { nested: { providerMetadata: "placeholder" } },
      { nested: { apiKey: "placeholder" } },
      { nested: { accessToken: "placeholder" } },
      { nested: [{ Authorization: "placeholder" }] },
      // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- benign rejection fixture
      { nested: [{ user_password: "placeholder" }] },
      { nested: [{ client_secret_value: "placeholder" }] },
      { nested: [{ sessionCookie: "placeholder" }] },
      { nested: [{ PRIVATE_KEY_PEM: "placeholder" }] },
      { nested: [{ secretMaterial: "placeholder" }] },
      { nested: [{ userAuthorizationValue: "placeholder" }] },
      { nested: [{ USER_AUTHORIZATION_VALUE: "placeholder" }] },
      // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- benign rejection fixture
      { nested: [{ userPasswordValue: "placeholder" }] },
      // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- benign rejection fixture
      { nested: [{ "user-password-value": "placeholder" }] },
      { nested: [{ applicationSecretValue: "placeholder" }] },
      { nested: [{ application_secret_value: "placeholder" }] },
      { nested: [{ sessionCookieValue: "placeholder" }] },
      { nested: [{ session_cookie_value: "placeholder" }] },
    ];
    const unsafeValues: JsonValue[] = [
      { safeKey: "/private/data" },
      { safeKey: "https://storage.invalid/file?token=secret" },
      { safeKey: "Bearer raw-secret" },
    ];
    for (const value of [...unsafeKeys, ...unsafeValues]) {
      expect(() => jsonStorageValue(value)).toThrow();
    }

    expect(
      jsonStorageValue({
        opaqueReferences: [secretRef("sk-reference-not-material"), resource],
      }),
    ).toEqual({
      kind: "json",
      value: {
        opaqueReferences: [{ secretId: "sk-reference-not-material" }, resource],
      },
    });
  });

  test("rejects malformed opaque-reference lookalikes recursively", () => {
    const lookalikes: JsonValue[] = [
      { ...resource, digest: "not-a-digest" },
      { ...resource, extra: "placeholder" },
      { ...resource, resourceId: "not-a-resource-id" },
      { ...resource, byteLength: "3" },
      { secretId: "" },
      { secretId: 42 },
      { secretId: "sk-reference-not-material", extra: "placeholder" },
    ];

    for (const lookalike of lookalikes) {
      expect(() => jsonStorageValue({ nested: [lookalike] })).toThrow();
    }
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
