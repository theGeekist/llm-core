import { describe, expect, it } from "bun:test";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import type { SnapshotData } from "@llamaindex/workflow-core/middleware/state";
import type { LlamaIndexCheckpointEntry, LlamaIndexCheckpointStore } from "#adapters";
import { fromLangGraphCheckpointer, fromLlamaIndexCheckpointStore } from "#adapters";

describe("Adapter checkpoint stores", () => {
  it("stores and reads resume snapshots via LangGraph checkpointers", async () => {
    const checkpointer = new MemorySaver();
    const store = fromLangGraphCheckpointer(checkpointer);
    const snapshot = {
      token: "thread-1",
      createdAt: 123,
      payload: { ok: true },
    };

    await store.set(snapshot.token, snapshot);
    const loaded = await store.get(snapshot.token);

    expect(loaded).toEqual(snapshot);
  });

  it("deletes checkpoints by token", async () => {
    const checkpointer = new MemorySaver();
    const store = fromLangGraphCheckpointer(checkpointer);
    const snapshot = {
      token: "thread-2",
      createdAt: 456,
      payload: { ok: false },
    };

    await store.set(snapshot.token, snapshot);
    await store.delete(snapshot.token);
    const loaded = await store.get(snapshot.token);

    expect(loaded).toBeUndefined();
  });

  it("stores and reads LlamaIndex snapshot checkpoints", async () => {
    const entries = new Map<string, LlamaIndexCheckpointEntry>();
    const store: LlamaIndexCheckpointStore = {
      get: (token) => entries.get(String(token)),
      set: (token, entry) => {
        entries.set(String(token), entry);
        return true;
      },
      delete: (token) => {
        entries.delete(String(token));
        return true;
      },
    };
    const checkpoint = fromLlamaIndexCheckpointStore(store);
    const snapshotData: SnapshotData = {
      queue: [[{ ok: true }, 1]],
      unrecoverableQueue: [],
      version: "v1",
      state: JSON.stringify({ count: 1 }),
    };
    const snapshot = {
      token: "li-1",
      createdAt: 100,
      lastAccessedAt: 110,
      pauseKind: "external" as const,
      payload: snapshotData,
    };

    await checkpoint.set(snapshot.token, snapshot);
    const loaded = await checkpoint.get(snapshot.token);

    expect(loaded).toEqual(snapshot);
  });

  it("skips invalid LlamaIndex snapshot payloads", async () => {
    const store: LlamaIndexCheckpointStore = {
      get: () => undefined,
      set: () => true,
      delete: () => true,
    };
    const checkpoint = fromLlamaIndexCheckpointStore(store);
    const snapshot = {
      token: "li-invalid",
      createdAt: 123,
      payload: { ok: true },
    };

    const result = await checkpoint.set(snapshot.token, snapshot);
    expect(result).toBe(false);
  });

  it("exposes touch and sweep when provided", async () => {
    const store: LlamaIndexCheckpointStore = {
      get: () => undefined,
      set: () => true,
      delete: () => true,
      touch: () => true,
      sweep: () => true,
    };
    const checkpoint = fromLlamaIndexCheckpointStore(store);

    expect(await checkpoint.touch?.("token")).toBe(true);
    expect(await checkpoint.sweep?.()).toBe(true);
  });
});
