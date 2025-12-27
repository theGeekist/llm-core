import type { SnapshotData } from "@llamaindex/workflow-core/middleware/state";
import type { CheckpointStore, PauseKind, ResumeSnapshot } from "../types";
import type { MaybePromise } from "../../maybe";
import { bindFirst, mapMaybeOr } from "../../maybe";
import { isRecord } from "../utils";

export type LlamaIndexCheckpointEntry = {
  snapshot: SnapshotData;
  pauseKind?: PauseKind;
  createdAt: number;
  lastAccessedAt?: number;
};

export type LlamaIndexCheckpointStore = {
  get: (token: unknown) => MaybePromise<LlamaIndexCheckpointEntry | undefined>;
  set: (token: unknown, entry: LlamaIndexCheckpointEntry, ttlMs?: number) => MaybePromise<void>;
  delete: (token: unknown) => MaybePromise<void>;
  touch?: (token: unknown, ttlMs?: number) => MaybePromise<void>;
  sweep?: () => MaybePromise<void>;
};

const isSnapshotData = (value: unknown): value is SnapshotData => {
  if (!isRecord(value)) {
    return false;
  }
  if (!Array.isArray(value.queue) || !Array.isArray(value.unrecoverableQueue)) {
    return false;
  }
  return typeof value.version === "string";
};

const readSnapshotPayload = (snapshot: ResumeSnapshot): SnapshotData | undefined =>
  isSnapshotData(snapshot.payload) ? snapshot.payload : undefined;

const toCheckpointEntry = (snapshot: ResumeSnapshot): LlamaIndexCheckpointEntry | undefined => {
  const payload = readSnapshotPayload(snapshot);
  if (!payload) {
    return undefined;
  }
  return {
    snapshot: payload,
    pauseKind: snapshot.pauseKind,
    createdAt: snapshot.createdAt,
    lastAccessedAt: snapshot.lastAccessedAt,
  };
};

const toResumeSnapshot = (token: unknown, entry: LlamaIndexCheckpointEntry): ResumeSnapshot => ({
  token,
  pauseKind: entry.pauseKind,
  createdAt: entry.createdAt,
  lastAccessedAt: entry.lastAccessedAt,
  payload: entry.snapshot,
});

const toResumeSnapshotWithToken = (token: unknown, entry: LlamaIndexCheckpointEntry) =>
  toResumeSnapshot(token, entry);

const returnUndefined = () => undefined;

const readEntry = (store: LlamaIndexCheckpointStore, token: unknown) =>
  mapMaybeOr(store.get(token), bindFirst(toResumeSnapshotWithToken, token), returnUndefined);

const storeEntry = (
  store: LlamaIndexCheckpointStore,
  token: unknown,
  snapshot: ResumeSnapshot,
  ttlMs?: number,
) => {
  const entry = toCheckpointEntry(snapshot);
  if (!entry) {
    return undefined;
  }
  return store.set(token, entry, ttlMs);
};

const deleteEntry = (store: LlamaIndexCheckpointStore, token: unknown) => store.delete(token);

const touchEntry = (store: LlamaIndexCheckpointStore, token: unknown, ttlMs?: number) =>
  store.touch ? store.touch(token, ttlMs) : undefined;

const sweepEntries = (store: LlamaIndexCheckpointStore) =>
  store.sweep ? store.sweep() : undefined;

export const fromLlamaIndexCheckpointStore = (
  store: LlamaIndexCheckpointStore,
): CheckpointStore => ({
  get: bindFirst(readEntry, store),
  set: bindFirst(storeEntry, store),
  delete: bindFirst(deleteEntry, store),
  touch: store.touch ? bindFirst(touchEntry, store) : undefined,
  sweep: store.sweep ? bindFirst(sweepEntries, store) : undefined,
});
