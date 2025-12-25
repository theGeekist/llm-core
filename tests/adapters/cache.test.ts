import { describe, expect, it } from "bun:test";
import { createMemoryCache } from "#adapters";
import type { AdapterDiagnostic, Blob } from "../../src/adapters/types";

describe("MemoryCache", () => {
  const blob: Blob = { bytes: new Uint8Array([1, 2, 3]), contentType: "application/octet-stream" };

  it("stores and retrieves values", async () => {
    const cache = createMemoryCache();
    await cache.set("key1", blob);
    const result = await cache.get("key1");
    expect(result).toEqual(blob);
  });

  it("returns undefined for missing keys", async () => {
    const cache = createMemoryCache();
    const result = await cache.get("missing");
    expect(result).toBeUndefined();
  });

  it("deletes values", async () => {
    const cache = createMemoryCache();
    await cache.set("key1", blob);
    await cache.delete("key1");
    const result = await cache.get("key1");
    expect(result).toBeUndefined();
  });

  it("respects TTL", async () => {
    const cache = createMemoryCache();
    await cache.set("key1", blob, 10); // 10ms TTL

    // Immediately available
    expect(await cache.get("key1")).toEqual(blob);

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should be gone
    expect(await cache.get("key1")).toBeUndefined();
  });

  it("validates keys", async () => {
    const cache = createMemoryCache();
    const diagnostics: unknown[] = [];
    const context = {
      report: (d: AdapterDiagnostic) => diagnostics.push(d),
    };

    await cache.set("", blob, undefined, context);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(await cache.get("")).toBeUndefined();
  });
});
