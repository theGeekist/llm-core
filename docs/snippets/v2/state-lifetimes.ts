import {
  createLiveContinuation,
  createSnapshot,
  isRegisteredResumableCheckpoint,
} from "@geekist/llm-core/state";

const continuation = createLiveContinuation({
  socket: new Map([["connected", true]]),
});

const snapshot = createSnapshot({
  snapshotId: "interaction:42",
  createdAt: "2026-07-30T00:00:00.000Z",
  value: { unread: 3 },
});

isRegisteredResumableCheckpoint(snapshot); // false: a snapshot is not resumable
void continuation;
