import type { PauseKind, ResumeSnapshot } from "../../adapters/types";
import type { MaybePromise } from "../../maybe";
import { mapMaybe } from "../../maybe";
import type { PauseSession } from "../driver";
import type { Runtime } from "../types";

export type SessionStore = {
  get: (token: unknown) => MaybePromise<ResumeSnapshot | undefined>;
  set: (token: unknown, snapshot: ResumeSnapshot, ttlMs?: number) => MaybePromise<void>;
  delete: (token: unknown) => MaybePromise<void>;
  touch?: (token: unknown, ttlMs?: number) => MaybePromise<void>;
  sweep?: () => MaybePromise<number>;
};

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

export const readSessionStore = (runtime?: Runtime): SessionStore | undefined => {
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

export const createSnapshotRecorder = (runtime?: Runtime) => {
  const store = readSessionStore(runtime);
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
    return store.set(token, createResumeSnapshot(token, pauseKind, payload), ttlMs);
  };
};

export const resolveResumeSession = (
  token: unknown,
  session: PauseSession | undefined,
  runtime?: Runtime,
): MaybePromise<ResumeSession> => {
  if (session) {
    return { kind: "iterator", session, store: readSessionStore(runtime) };
  }
  const store = readSessionStore(runtime);
  if (!store) {
    return { kind: "invalid" };
  }
  return mapMaybe(store.get(token), (snapshot) =>
    snapshot ? { kind: "snapshot", snapshot, store } : { kind: "invalid" },
  );
};
