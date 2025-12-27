import type {
  BaseCheckpointSaver,
  ChannelVersions,
  Checkpoint,
  CheckpointMetadata,
} from "@langchain/langgraph-checkpoint";
import type { CheckpointStore, ResumeSnapshot } from "../types";
import { bindFirst, mapMaybe } from "../../maybe";
import { isRecord } from "../utils";

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
    return undefined;
  }
  const value = readSnapshotValue(checkpoint);
  return isResumeSnapshot(value) ? value : undefined;
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

const toUndefined = () => undefined;

const readSnapshot = (checkpointer: BaseCheckpointSaver, token: unknown) => {
  const config = toCheckpointConfig(token);
  return mapMaybe(checkpointer.get(config), toSnapshot);
};

const storeSnapshotValue = (
  checkpointer: BaseCheckpointSaver,
  token: unknown,
  snapshot: ResumeSnapshot,
) => mapMaybe(storeSnapshot(checkpointer, token, snapshot), toUndefined);

const deleteSnapshotValue = (checkpointer: BaseCheckpointSaver, token: unknown) =>
  mapMaybe(deleteSnapshot(checkpointer, token), toUndefined);

export const fromLangGraphCheckpointer = (checkpointer: BaseCheckpointSaver): CheckpointStore => ({
  get: bindFirst(readSnapshot, checkpointer),
  set: bindFirst(storeSnapshotValue, checkpointer),
  delete: bindFirst(deleteSnapshotValue, checkpointer),
});
