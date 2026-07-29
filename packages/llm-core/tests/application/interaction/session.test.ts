import { describe, expect, test } from "bun:test";
import { isLiveContinuation } from "../../../src/features/state/public";
import {
  createInteractionSession,
  type ConversationSessionSnapshot,
  type ConversationSessionStore,
} from "../../../src/application/interaction/public";
import type { AgentRunRequest } from "../../../src/features/agent/public";
import type { AgentRunner } from "../../../src/features/agent/public";
import {
  AGENT,
  CONVERSATION_ID,
  INVOCATION_ID,
  NOW,
  OTHER_CONVERSATION_ID,
  completedRun,
} from "./helpers";

const memoryStore = () => {
  let snapshot: ConversationSessionSnapshot | null = null;
  const store: ConversationSessionStore = {
    load: () => snapshot,
    save: ({ expectedRevision, snapshot: next }) => {
      if ((snapshot?.value.revision ?? 0) !== expectedRevision) {
        return "conflict";
      }
      snapshot = next;
      return "saved";
    },
  };
  return { store, read: () => snapshot };
};

const runner = (
  start: AgentRunner["start"],
  providerSessionContinuation = true,
): AgentRunner => ({
  capabilities: () => ({
    runnerId: "test.runner",
    runnerVersion: AGENT.version,
    controlledEffects: false,
    cancellation: "cooperative",
    interventions: false,
    checkpointResume: false,
    providerSessionContinuation,
    durableExecutionSignalling: false,
    childRuns: false,
  }),
  prepare: () => AGENT,
  start,
});

describe("interaction session orchestration", () => {
  test("persists conversation snapshots and carries provider continuity only", async () => {
    const memory = memoryStore();
    const requests: AgentRunRequest[] = [];
    let snapshotSequence = 0;
    const session = createInteractionSession({
      conversationId: CONVERSATION_ID,
      agent: AGENT,
      runner: runner((request) => {
          requests.push(request);
          return completedRun(request);
        }),
      store: memory.store,
      identity: {
        now: () => NOW,
        newSnapshotId: () => `conversation-snapshot:${snapshotSequence++}`,
      },
    });

    const interaction = await session.send({
      input: { text: "hello" },
      invocationContext: { invocationId: INVOCATION_ID },
    });
    const liveEvents = [];
    for await (const event of interaction.events()) {
      liveEvents.push(event);
    }
    const first = await interaction.result();
    const second = await session.send({
      input: { text: "again" },
      invocationContext: { invocationId: INVOCATION_ID },
    });
    await second.result();

    expect(liveEvents.map((event) => event.kind)).toEqual([
      "agent-run",
      "agent-run",
      "agent-run",
    ]);
    expect(first.snapshot.kind).toBe("snapshot");
    expect(first.snapshot.value.turns).toHaveLength(1);
    expect(memory.read()?.value.turns).toHaveLength(2);
    expect(requests[0]?.invocationContext.conversationId).toBe(CONVERSATION_ID);
    expect(requests[0]?.providerSession).toBeUndefined();
    expect(requests[1]?.providerSession?.kind).toBe("provider-session-ref");
  });

  test("uses process-local reconnect and never represents workflow durability", async () => {
    const memory = memoryStore();
    const session = createInteractionSession({
      conversationId: CONVERSATION_ID,
      agent: AGENT,
      runner: runner(completedRun),
      store: memory.store,
      identity: { now: () => NOW, newSnapshotId: () => "snapshot:live" },
    });
    const interaction = await session.send({
      input: "hello",
      invocationContext: { invocationId: INVOCATION_ID },
    });

    expect(isLiveContinuation(interaction.continuation)).toBe(true);
    expect(session.reconnect(interaction.continuation).runId).toBe(interaction.runId);
    expect(() => JSON.stringify(interaction.continuation)).toThrow("cannot be serialized");
    await interaction.result();
  });

  test("rejects conversation identity substitution", async () => {
    const memory = memoryStore();
    const session = createInteractionSession({
      conversationId: CONVERSATION_ID,
      agent: AGENT,
      runner: runner(completedRun),
      store: memory.store,
      identity: { now: () => NOW, newSnapshotId: () => "snapshot:identity" },
    });

    await expect(
      session.send({
        input: "hello",
        invocationContext: {
          invocationId: INVOCATION_ID,
          conversationId: OTHER_CONVERSATION_ID,
        },
      }),
    ).rejects.toThrow("must match");
  });
});
