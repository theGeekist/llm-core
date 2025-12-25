import type {
  AdapterBundle,
  Cache,
  Blob as AdapterBlob,
  PauseKind,
  ResumeSnapshot,
} from "../../adapters/types";
import type { MaybePromise } from "../../maybe";
import { mapMaybe, mapMaybeOr } from "../../maybe";
import type { PauseSession } from "../driver";
import type { Runtime } from "../types";

export type SessionStore = {
  get: (token: unknown) => MaybePromise<ResumeSnapshot | undefined>;
  set: (token: unknown, snapshot: ResumeSnapshot, ttlMs?: number) => MaybePromise<void>;
  delete: (token: unknown) => MaybePromise<void>;
  touch?: (token: unknown, ttlMs?: number) => MaybePromise<void>;
  sweep?: () => MaybePromise<number>;
};

// Serialization helpers
const serialize = (snapshot: ResumeSnapshot): { value: AdapterBlob } => {
  const json = JSON.stringify(snapshot);
  const bytes = new TextEncoder().encode(json);
  return { value: { bytes, contentType: "application/json" } };
};

const deserialize = (blob: AdapterBlob | undefined): ResumeSnapshot | undefined => {
  if (!blob) return undefined;
  try {
    const json = new TextDecoder().decode(blob.bytes);
    return JSON.parse(json) as ResumeSnapshot;
  } catch {
    return undefined;
  }
};

export const createSessionStoreFromCache = (cache: Cache): SessionStore => ({
  get: (token: unknown) => {
    if (typeof token !== "string" && typeof token !== "number") {
      return undefined;
    }
    return mapMaybe(cache.get(String(token)), (blob) => deserialize(blob));
  },
  set: (token: unknown, snapshot: ResumeSnapshot, ttlMs?: number) => {
    if (typeof token !== "string" && typeof token !== "number") {
      return undefined;
    }
    try {
      const serialized = serialize(snapshot);
      return cache.set(String(token), serialized.value, ttlMs);
    } catch {
      return undefined;
    }
  },
  delete: (token: unknown) => {
    if (typeof token !== "string" && typeof token !== "number") {
      return undefined;
    }
    return cache.delete(String(token));
  },
});

export type ResumeSession =
  | { kind: "iterator"; session: PauseSession; store?: SessionStore }
  | { kind: "snapshot"; snapshot: ResumeSnapshot; store: SessionStore }
  | { kind: "invalid" };

const isSessionStore = (value: unknown): value is SessionStore => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const store = value as SessionStore;
  return (
    typeof store.get === "function" &&
    typeof store.set === "function" &&
    typeof store.delete === "function"
  );
};

export const readSessionStore = (
  runtime?: Runtime | { resume?: { sessionStore?: unknown } },
): SessionStore | undefined => {
  const candidate = (runtime?.resume as { sessionStore?: unknown } | undefined)?.sessionStore;
  return isSessionStore(candidate) ? candidate : undefined;
};

export const readSessionTtlMs = (
  runtime?: Runtime | { resume?: { sessionTtlMs?: unknown } },
): number | undefined => {
  const ttl = (runtime?.resume as { sessionTtlMs?: unknown } | undefined)?.sessionTtlMs;
  return typeof ttl === "number" ? ttl : undefined;
};

const readPauseSnapshotPayload = (result: unknown) => {
  const typed = result as { pauseSnapshot?: unknown; resumeSnapshot?: unknown };
  return typed.pauseSnapshot ?? typed.resumeSnapshot;
};

const createResumeSnapshot = (
  token: unknown,
  pauseKind: PauseKind | undefined,
  payload: unknown,
): ResumeSnapshot => {
  const createdAt = Date.now();
  return {
    token,
    pauseKind,
    createdAt,
    lastAccessedAt: createdAt,
    payload,
  };
};

export const createSnapshotRecorder = (store: SessionStore | undefined, runtime?: Runtime) => {
  if (!store) {
    return function recordSnapshot() {
      return undefined;
    };
  }
  const ttlMs = readSessionTtlMs(runtime);
  return function recordSnapshot(result: unknown) {
    const token = (result as { token?: unknown }).token;
    if (token === undefined) {
      return undefined;
    }
    const pauseKind = (result as { pauseKind?: PauseKind }).pauseKind;
    const payload = readPauseSnapshotPayload(result);
    // Guard against store errors or serialization failures
    try {
      return store.set(token, createResumeSnapshot(token, pauseKind, payload), ttlMs);
    } catch {
      return undefined;
    }
  };
};

export const resolveResumeSession = (
  token: unknown,
  session: PauseSession | undefined,
  store: SessionStore | undefined,
): MaybePromise<ResumeSession> => {
  if (session) {
    return { kind: "iterator", session, store };
  }
  if (!store) {
    return { kind: "invalid" };
  }
  return mapMaybeOr<ResumeSnapshot, ResumeSession>(
    store.get(token),
    (snapshot) => ({ kind: "snapshot", snapshot, store }),
    () => ({ kind: "invalid" }),
  );
};

export const resolveSessionStore = (runtime: Runtime | undefined, adapters: AdapterBundle) => {
  const runtimeStore = readSessionStore(runtime);
  if (runtimeStore) {
    return runtimeStore;
  }
  return adapters.cache ? createSessionStoreFromCache(adapters.cache) : undefined;
};
