import { describe, expect, test } from "bun:test";
import { isLiveContinuation } from "../../../src/features/state/public";
import {
  createInteractionSession,
  type ConversationSessionSnapshot,
  type ConversationSessionStore,
  type InteractionSession,
} from "../../../src/application/interaction/public";
import type { AgentRunRequest } from "../../../src/features/agent/public";
import type { AgentRunner } from "../../../src/features/agent/public";
import {
  AGENT,
  CONVERSATION_ID,
  INVOCATION_ID,
  NOW,
  OTHER_CONVERSATION_ID,
  SECOND_RUN_ID,
  completedRun,
  contentEvent,
} from "./helpers";

const memoryStore = () => {
  let snapshot: ConversationSessionSnapshot | null = null;
  let reservation: string | null = null;
  const store: ConversationSessionStore = {
    load: () => snapshot,
    reserve: ({ conversationId, expectedRevision, reservationId }) => {
      if (
        reservation ||
        (snapshot?.value.revision ?? 0) !== expectedRevision
      ) {
        return null;
      }
      reservation = reservationId;
      return { conversationId, expectedRevision, reservationId };
    },
    save: ({ expectedRevision, reservationId, snapshot: next }) => {
      if (
        reservation !== reservationId ||
        (snapshot?.value.revision ?? 0) !== expectedRevision
      ) {
        return "conflict";
      }
      snapshot = next;
      return "saved";
    },
    release: ({ reservationId }) => {
      if (reservation === reservationId) {
        reservation = null;
      }
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
    let runSequence = 0;
    let snapshotSequence = 0;
    const session = createInteractionSession({
      conversationId: CONVERSATION_ID,
      agent: AGENT,
      runner: runner((request) => {
        requests.push(request);
        const runId = runSequence++ === 0 ? undefined : SECOND_RUN_ID;
        return completedRun(request, undefined, runId);
      }),
      store: memory.store,
      identity: {
        now: () => NOW,
        newSnapshotId: () => `conversation-snapshot:${snapshotSequence++}`,
        newReservationId: () => `conversation-reservation:${snapshotSequence}`,
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
      identity: {
        now: () => NOW,
        newSnapshotId: () => "snapshot:live",
        newReservationId: () => "reservation:live",
      },
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
      identity: {
        now: () => NOW,
        newSnapshotId: () => "snapshot:identity",
        newReservationId: () => "reservation:identity",
      },
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

    const valid = await session.send({
      input: "valid",
      invocationContext: { invocationId: INVOCATION_ID },
    });
    await valid.result();
  });

  test("serializes send startup before awaiting persistence or runner preparation", async () => {
    const memory = memoryStore();
    let releaseStart!: () => void;
    const startGate = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    const session = createInteractionSession({
      conversationId: CONVERSATION_ID,
      agent: AGENT,
      runner: runner(async (request) => {
        await startGate;
        return completedRun(request);
      }),
      store: memory.store,
      identity: {
        now: () => NOW,
        newSnapshotId: () => "snapshot:serialized",
        newReservationId: () => "reservation:serialized",
      },
    });

    const first = session.send({
      input: "first",
      invocationContext: { invocationId: INVOCATION_ID },
    });
    await expect(
      session.send({
        input: "second",
        invocationContext: { invocationId: INVOCATION_ID },
      }),
    ).rejects.toThrow("cannot start concurrent runs");

    releaseStart();
    const interaction = await first;
    await interaction.result();
  });

  test("reserves a shared store revision before a competing runner can start", async () => {
    const memory = memoryStore();
    let releaseStart!: () => void;
    let announceStart!: () => void;
    const startGate = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    const started = new Promise<void>((resolve) => {
      announceStart = resolve;
    });
    let starts = 0;
    const sharedRunner = runner(async (request) => {
      starts += 1;
      announceStart();
      await startGate;
      return completedRun(request);
    });
    let identitySequence = 0;
    const create = () =>
      createInteractionSession({
        conversationId: CONVERSATION_ID,
        agent: AGENT,
        runner: sharedRunner,
        store: memory.store,
        identity: {
          now: () => NOW,
          newSnapshotId: () => `snapshot:shared:${identitySequence++}`,
          newReservationId: () => `reservation:shared:${identitySequence++}`,
        },
      });
    const firstSession = create();
    const secondSession = create();

    const first = firstSession.send({
      input: "first",
      invocationContext: { invocationId: INVOCATION_ID },
    });
    await started;
    await expect(
      secondSession.send({
        input: "second",
        invocationContext: { invocationId: INVOCATION_ID },
      }),
    ).rejects.toThrow("could not reserve");
    expect(starts).toBe(1);

    releaseStart();
    const interaction = await first;
    await interaction.result();
  });

  test("rejects nested undeclared snapshot data before it reaches the runner", async () => {
    const memory = memoryStore();
    const sourceSession = createInteractionSession({
      conversationId: CONVERSATION_ID,
      agent: AGENT,
      runner: runner(completedRun),
      store: memory.store,
      identity: {
        now: () => NOW,
        newSnapshotId: () => "snapshot:source",
        newReservationId: () => "reservation:source",
      },
    });
    const sourceRun = await sourceSession.send({
      input: "source",
      invocationContext: { invocationId: INVOCATION_ID },
    });
    await sourceRun.result();
    const tainted = structuredClone(memory.read()) as unknown as {
      value: {
        turns: Array<Record<string, unknown>>;
        providerSession: Record<string, unknown>;
      };
    };
    tainted.value.turns[0]!.credential = "sk-must-not-forward";
    tainted.value.providerSession.signedUrl = "https://example.test/?sig=secret";
    let starts = 0;
    const session = createInteractionSession({
      conversationId: CONVERSATION_ID,
      agent: AGENT,
      runner: runner((request) => {
        starts += 1;
        return completedRun(request);
      }),
      store: { ...memory.store, load: () => tainted as never },
      identity: {
        now: () => NOW,
        newSnapshotId: () => "snapshot:target",
        newReservationId: () => "reservation:target",
      },
    });

    await expect(session.load()).rejects.toThrow("closed");
    expect(starts).toBe(0);
  });

  test("buffers canonical redacted content emitted during runner startup", async () => {
    const memory = memoryStore();
    const session: InteractionSession = createInteractionSession({
      conversationId: CONVERSATION_ID,
      agent: AGENT,
      runner: runner(async (request) => {
        await session.emitContent(
          contentEvent("interaction.message.started", 0, {
            messageId: "message:startup",
          }),
        );
        await session.emitContent(
          contentEvent("interaction.message.text.delta", 1, {
            messageId: "message:startup",
            text: "safe output",
          }),
        );
        await session.emitContent(
          contentEvent("interaction.message.completed", 2, {
            messageId: "message:startup",
          }),
        );
        return completedRun(request);
      }),
      store: memory.store,
      identity: {
        now: () => NOW,
        newSnapshotId: () => "snapshot:content",
        newReservationId: () => "reservation:content",
      },
    });

    const interaction = await session.send({
      input: "hello",
      invocationContext: { invocationId: INVOCATION_ID },
    });
    const events = [];
    for await (const event of interaction.events()) {
      events.push(event);
    }
    await interaction.result();

    expect(events.slice(0, 3).map((event) => event.kind)).toEqual([
      "content",
      "content",
      "content",
    ]);
  });
});
