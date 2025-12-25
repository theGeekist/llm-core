import { describe, expect, it } from "bun:test";
import type { ResumeSnapshot } from "../../src/adapters/types";
import {
  createSessionStoreFromCache,
  createSnapshotRecorder,
  readSessionStore,
} from "../../src/workflow/runtime/resume-session";
import { createMemoryCache } from "../../src/adapters/primitives/cache";

describe("Resume Edge Cases", () => {
  describe("Serialization Safety", () => {
    it("should handle circular references without crashing", async () => {
      const cache = createMemoryCache();
      const store = createSessionStoreFromCache(cache);
      const recorder = createSnapshotRecorder(store, undefined);

      const circular: Record<string, unknown> = { data: "test" };
      circular.self = circular;

      await expect(
        Promise.resolve(recorder({ token: "token-circular", pauseSnapshot: circular })),
      ).resolves.toBeUndefined();
    });

    it("should handle BigInt without crashing", async () => {
      const cache = createMemoryCache();
      const store = createSessionStoreFromCache(cache);
      const recorder = createSnapshotRecorder(store, undefined);

      const payload = { value: 10n };

      await expect(
        Promise.resolve(recorder({ token: "token-bigint", pauseSnapshot: payload })),
      ).resolves.toBeUndefined();
    });
  });

  describe("Token Semantics", () => {
    it("should reject non-string/number tokens for cache store", () => {
      const cache = createMemoryCache();
      const store = createSessionStoreFromCache(cache);
      const invalidToken = { custom: "token" };

      // We'll mock cache.set to see what key is passed
      const originalSet = cache.set;
      let capturedKey: string | undefined;
      cache.set = (key, val, ttl) => {
        capturedKey = key;
        return originalSet(key, val, ttl);
      };

      store.set(invalidToken, { token: "token", createdAt: Date.now() });

      // Desired behavior: should not call set, so capturedKey is undefined
      expect(capturedKey).toBeUndefined();
    });

    it("should allow string/number tokens and persist correctly", async () => {
      const cache = createMemoryCache();
      const store = createSessionStoreFromCache(cache);

      const token = "valid-token";
      const snapshot: ResumeSnapshot = {
        token,
        createdAt: Date.now(),
        payload: { ok: true },
      };

      await store.set(token, snapshot);

      const retrieved = await store.get(token);
      expect(retrieved).toEqual(snapshot);

      const numToken = 123;
      const snapshot2: ResumeSnapshot = { token: numToken, createdAt: Date.now() };
      await store.set(numToken, snapshot2);
      const retrieved2 = await store.get(numToken);
      expect(retrieved2).toEqual(snapshot2);
    });

    it("should delete tokens correctly", async () => {
      const cache = createMemoryCache();
      const store = createSessionStoreFromCache(cache);
      const token = "to-delete";
      await store.set(token, { token, createdAt: Date.now() });
      await store.delete(token);
      const retrieved = await store.get(token);
      expect(retrieved).toBeUndefined();
    });

    it("should handle deserialize error", async () => {
      const cache = createMemoryCache();
      const store = createSessionStoreFromCache(cache);
      // Manually insert bad JSON
      cache.set("bad-json", {
        bytes: new TextEncoder().encode("{ bad json"),
        contentType: "application/json",
      });

      const result = await store.get("bad-json");
      expect(result).toBeUndefined();
    });

    it("should ignore invalid tokens for get and delete", async () => {
      const cache = createMemoryCache();
      const store = createSessionStoreFromCache(cache);
      const invalidToken = { custom: "token" };

      const result = await store.get(invalidToken);
      expect(result).toBeUndefined();

      const deleteResult = await store.delete(invalidToken);
      expect(deleteResult).toBeUndefined();
    });
  });

  describe("Session Store Resolution", () => {
    it("should return undefined for invalid session store candidates", () => {
      expect(readSessionStore({})).toBeUndefined();
      expect(readSessionStore({ resume: { sessionStore: "not-an-object" } })).toBeUndefined();
      expect(readSessionStore({ resume: { sessionStore: {} } })).toBeUndefined(); // Missing methods
      expect(readSessionStore({ resume: { sessionStore: { get: () => {} } } })).toBeUndefined(); // Partial methods
    });
  });

  describe("Provider Overrides", () => {
    it("is covered by tests/workflow/registry-runtime.test.ts", () => {
      // The logic for provider overrides in resume is complex to mock here.
      // It is fully covered by the integration test 're-resolves providers during resume...'
      // in registry-runtime.test.ts.
      expect(true).toBe(true);
    });
  });
});
