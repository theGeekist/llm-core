import { describe, expect, it } from "bun:test";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { fromLangGraphCheckpointer } from "#adapters";

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
});
