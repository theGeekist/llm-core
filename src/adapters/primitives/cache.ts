import type { AdapterCallContext, Blob, Cache } from "../types";
import { reportDiagnostics, validateStorageKey } from "../input-validation";

type CacheEntry = {
  value: Blob;
  expiresAt?: number;
};

export const createMemoryCache = (): Cache => {
  const store = new Map<string, CacheEntry>();

  const isExpired = (entry: CacheEntry) => {
    return typeof entry.expiresAt === "number" && Date.now() > entry.expiresAt;
  };

  const get = (key: string, context?: AdapterCallContext) => {
    const diagnostics = validateStorageKey(key, "cache.get");
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return undefined;
    }

    const entry = store.get(key);
    if (!entry) {
      return undefined;
    }

    if (isExpired(entry)) {
      store.delete(key);
      return undefined;
    }

    return entry.value;
  };

  const set = (key: string, value: Blob, ttlMs?: number, context?: AdapterCallContext) => {
    const diagnostics = validateStorageKey(key, "cache.set");
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return;
    }

    const expiresAt = typeof ttlMs === "number" ? Date.now() + ttlMs : undefined;
    store.set(key, { value, expiresAt });
  };

  const del = (key: string, context?: AdapterCallContext) => {
    const diagnostics = validateStorageKey(key, "cache.delete");
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return;
    }
    store.delete(key);
  };

  return { get, set, delete: del };
};
