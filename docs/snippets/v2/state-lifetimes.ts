import {
  createLiveContinuation,
  createSnapshot,
  type LiveContinuation,
  type Snapshot,
} from "@geekist/llm-core/state";

const continuation: LiveContinuation<{ socket: Map<string, boolean> }> = createLiveContinuation({
  socket: new Map([["connected", true]]),
});

const snapshot: Snapshot = createSnapshot({
  snapshotId: "interaction:42",
  createdAt: "2026-07-30T00:00:00.000Z",
  value: { unread: 3 },
});

console.log(snapshot.kind); // "snapshot": an observation, not a resumable checkpoint
void continuation;
