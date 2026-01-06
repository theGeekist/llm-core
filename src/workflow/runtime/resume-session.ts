import type {
  AdapterBundle,
  Cache,
  Blob as AdapterBlob,
  PauseKind,
  ResumeSnapshot,
} from "../../adapters/types";
import type { MaybePromise } from "../../maybe";
import { bindFirst, maybeChain, maybeMap, maybeMapOr } from "../../maybe";
import type { PauseSession } from "../driver";
import type { Runtime } from "../types";
import { readPipelinePauseSnapshot, toPauseKind } from "../pause";

export type SessionStore = {
  get: (token: unknown) => MaybePromise<ResumeSnapshot | null>;
  set: (token: unknown, snapshot: ResumeSnapshot, ttlMs?: number) => MaybePromise<boolean | null>;
  delete: (token: unknown) => MaybePromise<boolean | null>;
  touch?: (token: unknown, ttlMs?: number) => MaybePromise<boolean | null>;
  sweep?: () => MaybePromise<boolean | null>;
};

type SnapshotWriteInput = {
  store: SessionStore;
  token: unknown;
  resumeKey?: string | null;
  snapshot: ResumeSnapshot;
  ttlMs?: number;
};

type ResumeSessionSnapshotInput = {
  store: SessionStore;
  token: unknown;
  resumeKey?: string | null;
};

// Serialization helpers
const serialize = (snapshot: ResumeSnapshot): { value: AdapterBlob } | null => {
  const json = JSON.stringify(snapshot);
  const bytes = new TextEncoder().encode(json);
  return { value: { bytes, contentType: "application/json" } };
};

const deserialize = (blob: AdapterBlob | null): ResumeSnapshot | null => {
  if (!blob) return null;
  try {
    const json = new TextDecoder().decode(blob.bytes);
    return JSON.parse(json) as ResumeSnapshot;
  } catch {
    return null;
  }
};

export const createSessionStoreFromCache = (cache: Cache): SessionStore => ({
  get: (token: unknown) => {
    if (typeof token !== "string" && typeof token !== "number") {
      return null;
    }
    return maybeMap(deserialize, cache.get(String(token)));
  },
  set: (token: unknown, snapshot: ResumeSnapshot, ttlMs?: number) => {
    if (typeof token !== "string" && typeof token !== "number") {
      return false;
    }
    try {
      const serialized = serialize(snapshot);
      if (!serialized) {
        return false;
      }
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
): SessionStore | null => {
  const candidate = (runtime?.resume as { sessionStore?: unknown } | undefined)?.sessionStore;
  return isSessionStore(candidate) ? candidate : null;
};

export const readSessionTtlMs = (
  runtime?: Runtime | { resume?: { sessionTtlMs?: unknown } },
): number | null => {
  const ttl = (runtime?.resume as { sessionTtlMs?: unknown } | undefined)?.sessionTtlMs;
  return typeof ttl === "number" ? ttl : null;
};

const isResumeKey = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const readResumeKeyFromState = (state: unknown): string | null => {
  if (!state || typeof state !== "object") {
    return null;
  }
  const resumeKey = (state as { __pause?: { resumeKey?: unknown } }).__pause?.resumeKey;
  return isResumeKey(resumeKey) ? resumeKey : null;
};

const readResumeKeyFromSnapshot = (
  snapshot: ReturnType<typeof readPipelinePauseSnapshot>,
): string | null => readResumeKeyFromState(snapshot?.state);

const readResumeKeyFromResult = (result: unknown): string | null => {
  const snapshot = readPipelinePauseSnapshot(result);
  if (snapshot) {
    const resumeKey = readResumeKeyFromSnapshot(snapshot);
    if (resumeKey) {
      return resumeKey;
    }
  }
  const directResumeKey = (result as { resumeKey?: unknown }).resumeKey;
  if (isResumeKey(directResumeKey)) {
    return directResumeKey;
  }
  const artifactResumeKey = (result as { artifact?: { __pause?: { resumeKey?: unknown } } })
    .artifact?.__pause?.resumeKey;
  if (isResumeKey(artifactResumeKey)) {
    return artifactResumeKey;
  }
  const stateResumeKey = (result as { state?: { __pause?: { resumeKey?: unknown } } }).state
    ?.__pause?.resumeKey;
  return isResumeKey(stateResumeKey) ? stateResumeKey : null;
};

const readPauseSnapshotPayload = (result: unknown) => {
  const typed = result as { pauseSnapshot?: unknown; resumeSnapshot?: unknown };
  return typed.pauseSnapshot ?? typed.resumeSnapshot;
};

type CreateResumeSnapshotInput = {
  token: unknown;
  pauseKind: PauseKind | null;
  payload: unknown;
  snapshot?: unknown;
  resumeKey?: string | null;
};

const createResumeSnapshot = (input: CreateResumeSnapshotInput): ResumeSnapshot => {
  const createdAt = Date.now();
  return {
    token: input.token,
    resumeKey: input.resumeKey ?? null,
    pauseKind: input.pauseKind,
    createdAt,
    lastAccessedAt: createdAt,
    payload: input.payload,
    snapshot: input.snapshot,
  };
};

const canWriteResumeKey = (input: SnapshotWriteInput) =>
  isResumeKey(input.resumeKey) && input.resumeKey !== input.token;

const writeSnapshotPrimary = (input: SnapshotWriteInput) =>
  input.store.set(input.token, input.snapshot, input.ttlMs);

const writeSnapshotAlias = (input: SnapshotWriteInput) =>
  input.store.set(input.resumeKey as string, input.snapshot, input.ttlMs);

const writeSnapshotWithResumeKey = (input: SnapshotWriteInput) => {
  const primary = writeSnapshotPrimary(input);
  if (!canWriteResumeKey(input)) {
    return primary;
  }
  return maybeChain(bindFirst(writeSnapshotAlias, input), primary);
};

const toSnapshotSession = (store: SessionStore, snapshot: ResumeSnapshot): ResumeSession => ({
  kind: "snapshot",
  snapshot,
  store,
});

const toInvalidSession = (): ResumeSession => ({ kind: "invalid" });

const resolveSnapshotSessionByKey = (input: ResumeSessionSnapshotInput, key: unknown) =>
  maybeMapOr<ResumeSnapshot, ResumeSession>(
    bindFirst(toSnapshotSession, input.store),
    toInvalidSession,
    input.store.get(key),
  );

const resolveSnapshotSessionByToken = (input: ResumeSessionSnapshotInput) =>
  resolveSnapshotSessionByKey(input, input.token);

const resolveResumeSessionFromStore = (input: ResumeSessionSnapshotInput) => {
  if (!input.resumeKey) {
    return resolveSnapshotSessionByToken(input);
  }
  return maybeMapOr<ResumeSnapshot, ResumeSession>(
    bindFirst(toSnapshotSession, input.store),
    bindFirst(resolveSnapshotSessionByToken, input),
    input.store.get(input.resumeKey),
  );
};

export const createSnapshotRecorder = (
  store: SessionStore | null | undefined,
  runtime?: Runtime,
) => {
  if (!store) {
    return function recordSnapshot() {
      return null;
    };
  }
  const ttlMs = readSessionTtlMs(runtime) ?? undefined;
  return function recordSnapshot(result: unknown) {
    const pipelineSnapshot = readPipelinePauseSnapshot(result);
    const token = pipelineSnapshot ? pipelineSnapshot.token : (result as { token?: unknown }).token;
    if (token === null || token === undefined) {
      return false;
    }
    const pauseKind = pipelineSnapshot
      ? toPauseKind(pipelineSnapshot.pauseKind)
      : ((result as { pauseKind?: PauseKind | null }).pauseKind ?? null);
    const payload = pipelineSnapshot ? pipelineSnapshot.payload : readPauseSnapshotPayload(result);
    const snapshot = pipelineSnapshot ?? (result as { snapshot?: unknown }).snapshot;
    const resumeKey = readResumeKeyFromResult(result);
    // Guard against store errors or serialization failures
    try {
      return writeSnapshotWithResumeKey({
        store,
        token,
        resumeKey,
        snapshot: createResumeSnapshot({
          token,
          pauseKind,
          payload,
          snapshot,
          resumeKey,
        }),
        ttlMs,
      });
    } catch {
      return false;
    }
  };
};

type ResolveResumeSessionInput = {
  token: unknown;
  resumeKey?: string | null;
  session?: PauseSession;
  store?: SessionStore | null;
};

export const resolveResumeSession = (
  input: ResolveResumeSessionInput,
): MaybePromise<ResumeSession> => {
  if (input.session) {
    return { kind: "pause", session: input.session, store: input.store ?? undefined };
  }
  if (!input.store) {
    return { kind: "invalid" };
  }
  return resolveResumeSessionFromStore({
    store: input.store,
    token: input.token,
    resumeKey: isResumeKey(input.resumeKey) ? input.resumeKey : null,
  });
};

export const resolveSessionStore = (
  runtime: Runtime | undefined,
  adapters: AdapterBundle,
): SessionStore | null => {
  const runtimeStore = readSessionStore(runtime);
  if (runtimeStore) {
    return runtimeStore;
  }
  if (adapters.checkpoint) {
    return adapters.checkpoint;
  }
  return adapters.cache ? createSessionStoreFromCache(adapters.cache) : null;
};

export const runSessionStoreSweep = (store: SessionStore | null | undefined) =>
  store?.sweep ? store.sweep() : null;
