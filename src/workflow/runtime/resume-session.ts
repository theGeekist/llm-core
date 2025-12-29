import type {
  AdapterBundle,
  Cache,
  Blob as AdapterBlob,
  PauseKind,
  ResumeSnapshot,
} from "../../adapters/types";
import type { MaybePromise } from "../../maybe";
import { maybeMap, maybeMapOr } from "../../maybe";
import type { PauseSession } from "../driver";
import type { Runtime } from "../types";
import { readPipelinePauseSnapshot, toPauseKind } from "../pause";

export type SessionStore = {
  get: (token: unknown) => MaybePromise<ResumeSnapshot | undefined>;
  set: (token: unknown, snapshot: ResumeSnapshot, ttlMs?: number) => MaybePromise<boolean | null>;
  delete: (token: unknown) => MaybePromise<boolean | null>;
  touch?: (token: unknown, ttlMs?: number) => MaybePromise<boolean | null>;
  sweep?: () => MaybePromise<boolean | null>;
};

// Serialization helpers
const serialize = (snapshot: ResumeSnapshot): { value: AdapterBlob } => {
  const json = JSON.stringify(snapshot);
  const bytes = new TextEncoder().encode(json);
  return { value: { bytes, contentType: "application/json" } };
};

const deserialize = (blob: AdapterBlob | null): ResumeSnapshot | undefined => {
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
    return maybeMap(deserialize, cache.get(String(token)));
  },
  set: (token: unknown, snapshot: ResumeSnapshot, ttlMs?: number) => {
    if (typeof token !== "string" && typeof token !== "number") {
      return false;
    }
    try {
      const serialized = serialize(snapshot);
      return cache.set(String(token), serialized.value, ttlMs);
    } catch {
      return false;
    }
  },
  delete: (token: unknown) => {
    if (typeof token !== "string" && typeof token !== "number") {
      return false;
    }
    return cache.delete(String(token));
  },
});

export type ResumeSession =
  | { kind: "pause"; session: PauseSession; store?: SessionStore }
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
  snapshot?: unknown,
): ResumeSnapshot => {
  const createdAt = Date.now();
  return {
    token,
    pauseKind,
    createdAt,
    lastAccessedAt: createdAt,
    payload,
    snapshot,
  };
};

export const createSnapshotRecorder = (store: SessionStore | undefined, runtime?: Runtime) => {
  if (!store) {
    return function recordSnapshot() {
      return null;
    };
  }
  const ttlMs = readSessionTtlMs(runtime);
  return function recordSnapshot(result: unknown) {
    const pipelineSnapshot = readPipelinePauseSnapshot(result);
    const token = pipelineSnapshot ? pipelineSnapshot.token : (result as { token?: unknown }).token;
    if (token === undefined) {
      return false;
    }
    const pauseKind = pipelineSnapshot
      ? toPauseKind(pipelineSnapshot.pauseKind)
      : (result as { pauseKind?: PauseKind }).pauseKind;
    const payload = pipelineSnapshot ? pipelineSnapshot.payload : readPauseSnapshotPayload(result);
    const snapshot = pipelineSnapshot ?? (result as { snapshot?: unknown }).snapshot;
    // Guard against store errors or serialization failures
    try {
      return store.set(token, createResumeSnapshot(token, pauseKind, payload, snapshot), ttlMs);
    } catch {
      return false;
    }
  };
};

export const resolveResumeSession = (
  token: unknown,
  session: PauseSession | undefined,
  store: SessionStore | undefined,
): MaybePromise<ResumeSession> => {
  if (session) {
    return { kind: "pause", session, store };
  }
  if (!store) {
    return { kind: "invalid" };
  }
  return maybeMapOr<ResumeSnapshot, ResumeSession>(
    (snapshot) => ({ kind: "snapshot", snapshot, store }),
    () => ({ kind: "invalid" }),
    store.get(token),
  );
};

export const resolveSessionStore = (runtime: Runtime | undefined, adapters: AdapterBundle) => {
  const runtimeStore = readSessionStore(runtime);
  if (runtimeStore) {
    return runtimeStore;
  }
  if (adapters.checkpoint) {
    return adapters.checkpoint;
  }
  return adapters.cache ? createSessionStoreFromCache(adapters.cache) : undefined;
};

export const runSessionStoreSweep = (store: SessionStore | undefined) =>
  store?.sweep ? store.sweep() : null;
