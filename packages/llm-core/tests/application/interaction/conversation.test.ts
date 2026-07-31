import { describe, expect, test } from "bun:test";
import type { JsonValue } from "#contracts";
import type { Agent } from "../../../src/agent";
import {
  createConversation,
  type ConversationEvent,
  type ConversationSnapshot,
  type ConversationStore,
} from "../../../src/application/interaction/public";
import { AGENT, INVOCATION_ID, RUN_ID, SECOND_RUN_ID, completedRun } from "./helpers";

const readyAgent = (): Agent => {
  let sequence = 0;
  const start: Agent["start"] = (input: JsonValue) =>
    completedRun(
      {
        agent: AGENT,
        input,
        invocationContext: { invocationId: INVOCATION_ID },
      },
      undefined,
      sequence++ === 0 ? RUN_ID : SECOND_RUN_ID,
    );
  return Object.freeze({
    start,
    run: (input: JsonValue) => start(input).result(),
  });
};

const conversationStore = () => {
  let snapshot: ConversationSnapshot | null = null;
  let reserved: string | null = null;
  const store: ConversationStore = {
    load: () => snapshot,
    reserve: (request) => {
      if (reserved || (snapshot?.value.revision ?? 0) !== request.expectedRevision) {
        return null;
      }
      reserved = request.reservationId;
      return { ...request };
    },
    save: (request) => {
      if (
        reserved !== request.reservationId ||
        (snapshot?.value.revision ?? 0) !== request.expectedRevision
      ) {
        return "conflict";
      }
      snapshot = request.snapshot;
      reserved = null;
      return "saved";
    },
    release: (reservation) => {
      if (reserved === reservation.reservationId) reserved = null;
    },
  };
  return { store, snapshot: () => snapshot };
};

describe("common conversation facade", () => {
  test("streams projected conversation events and returns the agent result", async () => {
    const conversation = createConversation({ agent: readyAgent() });
    const run = conversation.stream({ text: "hello" });
    const events = [];

    for await (const event of run) events.push(event);

    expect(events.map((event) => event.kind)).toEqual([
      "run-started",
      "run-progress",
      "run-finished",
    ]);
    expect(events.every((event) => !("event" in event))).toBe(true);
    expect(await run.result()).toMatchObject({
      conversationId: conversation.conversationId,
      status: "completed",
      output: { text: "done" },
    });
  });

  test("persists ConversationState with ConversationRunRecord history", async () => {
    const memory = conversationStore();
    const conversation = createConversation({
      agent: readyAgent(),
      store: memory.store,
    });

    await conversation.send("hello");
    await conversation.send("again");

    expect(memory.snapshot()?.value.revision).toBe(2);
    expect(memory.snapshot()?.value.turns).toHaveLength(2);
    expect(memory.snapshot()?.value.turns.map((turn) => turn.input)).toEqual(["hello", "again"]);
  });

  test("propagates terminal failures through the event stream", async () => {
    const failure = new Error("conversation store unavailable");
    const memory = conversationStore();
    const conversation = createConversation({
      agent: readyAgent(),
      store: {
        ...memory.store,
        load: () => {
          throw failure;
        },
      },
    });
    const run = conversation.stream("hello");
    const observed: ConversationEvent[] = [];
    const events = (async () => {
      for await (const event of run) {
        observed.push(event);
      }
    })();

    await expect(events).rejects.toBe(failure);
    await expect(run.result()).rejects.toBe(failure);
    expect(observed).toEqual([]);
  });
});
