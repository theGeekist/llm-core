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
  get: (token: unknown) => MaybePromise<ResumeSnapshot | undefined>;
  set: (token: unknown, snapshot: ResumeSnapshot, ttlMs?: number) => MaybePromise<boolean | null>;
  delete: (token: unknown) => MaybePromise<boolean | null>;
  touch?: (token: unknown, ttlMs?: number) => MaybePromise<boolean | null>;
  sweep?: () => MaybePromise<boolean | null>;
};

type SnapshotWriteInput = {
  store: SessionStore;
  token: unknown;
  resumeKey?: string;
  snapshot: ResumeSnapshot;
  ttlMs?: number;
};

type ResumeSessionSnapshotInput = {
  store: SessionStore;
  token: unknown;
  resumeKey?: string;
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

const isResumeKey = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const readResumeKeyFromState = (state: unknown): string | undefined => {
  if (!state || typeof state !== "object") {
    return undefined;
  }
  const resumeKey = (state as { __pause?: { resumeKey?: unknown } }).__pause?.resumeKey;
  return isResumeKey(resumeKey) ? resumeKey : undefined;
};

const readResumeKeyFromSnapshot = (
  snapshot: ReturnType<typeof readPipelinePauseSnapshot>,
): string | undefined => readResumeKeyFromState(snapshot?.state);

const readResumeKeyFromResult = (result: unknown): string | undefined => {
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
  return isResumeKey(stateResumeKey) ? stateResumeKey : undefined;
};

const readPauseSnapshotPayload = (result: unknown) => {
  const typed = result as { pauseSnapshot?: unknown; resumeSnapshot?: unknown };
  return typed.pauseSnapshot ?? typed.resumeSnapshot;
};

type CreateResumeSnapshotInput = {
  token: unknown;
  pauseKind: PauseKind | undefined;
  payload: unknown;
  snapshot?: unknown;
  resumeKey?: string;
};

const createResumeSnapshot = (input: CreateResumeSnapshotInput): ResumeSnapshot => {
  const createdAt = Date.now();
  return {
    token: input.token,
    resumeKey: input.resumeKey,
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
  resumeKey?: string;
  session?: PauseSession;
  store?: SessionStore;
};

export const resolveResumeSession = (
  input: ResolveResumeSessionInput,
): MaybePromise<ResumeSession> => {
  if (input.session) {
    return { kind: "pause", session: input.session, store: input.store };
  }
  if (!input.store) {
    return { kind: "invalid" };
  }
  return resolveResumeSessionFromStore({
    store: input.store,
    token: input.token,
    resumeKey: isResumeKey(input.resumeKey) ? input.resumeKey : undefined,
  });
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
