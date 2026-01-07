import type {
  BaseCheckpointSaver,
  ChannelVersions,
  Checkpoint,
  CheckpointMetadata,
} from "@langchain/langgraph-checkpoint";
import type { CheckpointStore, ResumeSnapshot } from "../types";
import { bindFirst, maybeMap, toTrue } from "../../shared/maybe";
import { isRecord } from "../../shared/guards";

const CHECKPOINT_CHANNEL = "llm_core_snapshot";

const toThreadId = (token: unknown) => String(token);

const toCheckpointId = (token: unknown) => String(token);

const toCheckpointConfig = (token: unknown) => ({
  configurable: {
    thread_id: toThreadId(token),
  },
});

const toCheckpointMetadata = (): CheckpointMetadata => ({
  source: "update",
  step: 0,
  parents: {},
});

const toChannelVersions = (): ChannelVersions => ({});

const toCheckpoint = (snapshot: ResumeSnapshot): Checkpoint => ({
  v: 4,
  id: toCheckpointId(snapshot.token),
  ts: new Date().toISOString(),
  channel_values: {
    [CHECKPOINT_CHANNEL]: snapshot,
  },
  channel_versions: {},
  versions_seen: {},
});

const readSnapshotValue = (checkpoint: Checkpoint) =>
  (checkpoint.channel_values as Record<string, unknown> | undefined)?.[CHECKPOINT_CHANNEL];

const isResumeSnapshot = (value: unknown): value is ResumeSnapshot =>
  isRecord(value) && "token" in value && "createdAt" in value;

const toSnapshot = (checkpoint: Checkpoint | undefined) => {
  if (!checkpoint) {
    return null;
  }
  const value = readSnapshotValue(checkpoint);
  return isResumeSnapshot(value) ? value : null;
};

const storeSnapshot = (
  checkpointer: BaseCheckpointSaver,
  token: unknown,
  snapshot: ResumeSnapshot,
) => {
  const config = toCheckpointConfig(token);
  return checkpointer.put(
    config,
    toCheckpoint(snapshot),
    toCheckpointMetadata(),
    toChannelVersions(),
  );
};

const deleteSnapshot = (checkpointer: BaseCheckpointSaver, token: unknown) =>
  checkpointer.deleteThread(toThreadId(token));

const readSnapshot = (checkpointer: BaseCheckpointSaver, token: unknown) => {
  const config = toCheckpointConfig(token);
  return maybeMap(toSnapshot, checkpointer.get(config));
};

const storeSnapshotValue = (
  checkpointer: BaseCheckpointSaver,
  token: unknown,
  snapshot: ResumeSnapshot,
) => maybeMap(toTrue, storeSnapshot(checkpointer, token, snapshot));

const deleteSnapshotValue = (checkpointer: BaseCheckpointSaver, token: unknown) =>
  maybeMap(toTrue, deleteSnapshot(checkpointer, token));

export const fromLangGraphCheckpointer = (checkpointer: BaseCheckpointSaver): CheckpointStore => ({
  get: bindFirst(readSnapshot, checkpointer),
  set: bindFirst(storeSnapshotValue, checkpointer),
  delete: bindFirst(deleteSnapshotValue, checkpointer),
});
