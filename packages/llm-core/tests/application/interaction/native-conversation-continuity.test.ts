import { describe, expect, test } from "bun:test";
import {
  contractVersion,
  externalId,
  newCoreId,
  type EventId,
  type ProviderSessionId,
  type RunId,
} from "#contracts";
import type { ProviderSessionRef } from "../../../src/features/state/public";
import {
  registerNativeAgentConversationProfile,
  type AgentEvent,
  type AgentResult,
  type AgentStartRequest,
  type NativeAgentRun,
  type NativeAgentRunner,
  type NativeAgentOperationId,
  type RegisteredNativeAgentConversationProfile,
} from "../../../src/features/agent/public";
import {
  createInteractionSession,
  type ConversationSnapshot,
  type ConversationStore,
} from "../../../src/application/interaction/public";
import {
  AGENT,
  CONVERSATION_ID,
  INVOCATION_ID,
  PROVIDER_SESSION_ID,
  RUN_ID,
  SECOND_RUN_ID,
} from "./interaction-run-fixtures";

const NOW = "2026-08-25T04:00:00.000Z";

const memoryStore = () => {
  let snapshot: ConversationSnapshot | null = null;
  let reservation: string | null = null;
  const store: ConversationStore = {
    load: () => snapshot,
    reserve: ({ conversationId, expectedRevision, reservationId }) => {
      if (reservation || (snapshot?.value.revision ?? 0) !== expectedRevision) return null;
      reservation = reservationId;
      return { conversationId, expectedRevision, reservationId };
    },
    save: ({ expectedRevision, reservationId, snapshot: next }) => {
      if (reservation !== reservationId || (snapshot?.value.revision ?? 0) !== expectedRevision) {
        return "conflict";
      }
      snapshot = next;
      return "saved";
    },
    release: ({ reservationId }) => {
      if (reservation === reservationId) reservation = null;
    },
  };
  return { store, read: () => snapshot };
};

const operation = (
  id: Exclude<NativeAgentOperationId, "run.input.submit">,
  disposition: "supported" | "unsupported" = "supported",
) =>
  disposition === "supported"
    ? ({ operation: id, disposition, evidenceRefs: [`fixture:${id}`] } as const)
    : ({ operation: id, disposition, reasonCode: "qualification-failed" } as const);

const profile = (input?: {
  readonly providerId?: string;
  readonly routeProfileId?: string;
  readonly routeProfileVersion?: string;
  readonly start?: "supported" | "unsupported";
  readonly continuation?: "supported" | "unsupported";
  readonly observe?: "supported" | "unsupported";
  readonly cancel?: "supported" | "unsupported";
}): RegisteredNativeAgentConversationProfile =>
  registerNativeAgentConversationProfile({
    providerId: input?.providerId ?? "provider.codex",
    routeProfileId: input?.routeProfileId ?? "codex.app-server",
    routeProfileVersion: contractVersion(input?.routeProfileVersion ?? "1.0.0"),
    sourceContract: {
      authority: "Codex app-server",
      version: "0.148.0-alpha.9",
      revision: "codex-app-server-0.148.0-alpha.9",
    },
    operations: [
      operation("conversation.start", input?.start),
      operation("conversation.continue", input?.continuation),
      operation("run.observe", input?.observe),
      {
        operation: "run.input.submit",
        disposition: "supported",
        evidenceRefs: ["fixture:run.input.submit"],
        deliveryMode: "native-live",
      },
      operation("run.cancel", input?.cancel),
    ],
  });

const providerSession = (
  providerId = "provider.codex",
  sessionId: ProviderSessionId = PROVIDER_SESSION_ID,
): ProviderSessionRef => ({ kind: "provider-session-ref", providerId, sessionId });

const nativeRun = (input: {
  readonly runId: RunId;
  readonly early?: ProviderSessionRef;
  readonly terminal?: ProviderSessionRef;
  readonly providerCalls?: { count: number };
}): NativeAgentRun => {
  const event = (kind: AgentEvent["kind"], sequence: number, facts: AgentEvent["facts"]) =>
    ({
      eventId: newCoreId<EventId>(
        `018f0f4e-8c5b-7a91-8c3b-${input.runId === RUN_ID ? "310" : "320"}${String(sequence).padStart(9, "0")}`,
      ),
      kind,
      occurredAt: NOW,
      sequence,
      identity: { runId: input.runId },
      facts,
    }) as AgentEvent;
  return {
    identity: { runId: input.runId },
    async *events() {
      yield event("agent.run.started", 0, {
        agentId: AGENT.agentId,
        agentVersion: AGENT.version,
      });
      yield event("agent.run.completed", 1, { status: "completed" });
    },
    result: (): AgentResult => ({
      identity: { runId: input.runId },
      status: "completed",
      ...(input.terminal ? { providerSession: input.terminal } : {}),
    }),
    cancel: () => ({ status: "acknowledged", acknowledgedAt: NOW }),
    intervene: () => ({ status: "unsupported", acknowledgedAt: NOW }),
    providerSession: () => {
      if (input.providerCalls) input.providerCalls.count += 1;
      return input.early;
    },
    submitInput: (activeInput) => ({
      status: "accepted",
      messageId: activeInput.messageId,
      correlationId: activeInput.correlationId,
      acknowledgedAt: NOW,
    }),
    activeInputEvidence: (identity) => ({
      status: "unavailable",
      ...identity,
      stage: "semantic-processing",
      declaredAt: NOW,
      reasonCode: "provider-unobservable",
    }),
  };
};

const runner = (
  nativeProfile: RegisteredNativeAgentConversationProfile,
  start: NativeAgentRunner["start"],
  providerSessionContinuation = true,
): NativeAgentRunner => ({
  capabilities: () => ({
    runnerId: "test.native-continuity",
    runnerVersion: contractVersion("1.0.0"),
    controlledEffects: false,
    cancellation: "cooperative",
    interventions: false,
    checkpointResume: false,
    providerSessionContinuation,
    durableExecutionSignalling: false,
    childRuns: false,
    nativeConversation: nativeProfile,
  }),
  prepare: () => AGENT,
  start,
});

const sessionIdentity = (suffix: string) => ({
  now: () => NOW,
  newSnapshotId: () => `snapshot:${suffix}`,
  newReservationId: () => `reservation:${suffix}`,
});

describe("native conversation continuity", () => {
  test("caches early identity and recreates only the exact provider route", async () => {
    const memory = memoryStore();
    const route = profile();
    const calls = { count: 0 };
    const starts: AgentStartRequest[] = [];
    let sequence = 0;
    const create = (suffix: string) =>
      createInteractionSession({
        conversationId: CONVERSATION_ID,
        agent: AGENT,
        runner: runner(route, (request) => {
          starts.push(request);
          sequence += 1;
          return nativeRun({
            runId: sequence === 1 ? RUN_ID : SECOND_RUN_ID,
            early: providerSession(),
            terminal: providerSession(),
            providerCalls: calls,
          });
        }),
        store: memory.store,
        identity: sessionIdentity(suffix),
      });

    const first = await create("native-first").send({
      input: "first",
      invocationContext: { invocationId: INVOCATION_ID },
    });
    expect(await first.providerSession()).toEqual(providerSession());
    expect(await first.providerSession()).toEqual(providerSession());
    const settled = await first.result();
    expect(calls.count).toBe(1);
    expect(settled.snapshot.value.nativeConversation).toEqual({
      providerId: route.providerId,
      routeProfileId: route.routeProfileId,
      routeProfileVersion: route.routeProfileVersion,
    });

    const second = await create("native-second").send({
      input: "second",
      invocationContext: { invocationId: INVOCATION_ID },
    });
    await second.result();
    expect(starts[0]?.providerSession).toBeUndefined();
    expect(starts[1]?.providerSession).toEqual(providerSession());
    expect(calls.count).toBe(2);
  });

  test("rejects provider or route drift and unsupported lifecycle operations before start", async () => {
    const memory = memoryStore();
    const exact = profile();
    const source = createInteractionSession({
      conversationId: CONVERSATION_ID,
      agent: AGENT,
      runner: runner(exact, () =>
        nativeRun({ runId: RUN_ID, early: providerSession(), terminal: providerSession() }),
      ),
      store: memory.store,
      identity: sessionIdentity("native-source"),
    });
    const sourceRun = await source.send({
      input: "source",
      invocationContext: { invocationId: INVOCATION_ID },
    });
    await sourceRun.result();

    const incompatible = [
      profile({ providerId: "provider.other" }),
      profile({ routeProfileId: "codex.desktop-hooks" }),
      profile({ routeProfileVersion: "2.0.0" }),
      profile({ continuation: "unsupported" }),
    ];
    let starts = 0;
    for (const candidate of incompatible) {
      const recreated = createInteractionSession({
        conversationId: CONVERSATION_ID,
        agent: AGENT,
        runner: runner(
          candidate,
          () => {
            starts += 1;
            return nativeRun({ runId: SECOND_RUN_ID, early: providerSession() });
          },
          candidate.operations[1].disposition === "supported",
        ),
        store: memory.store,
        identity: sessionIdentity(`native-drift:${candidate.routeProfileId}`),
      });
      await expect(
        recreated.send({ input: "continue", invocationContext: { invocationId: INVOCATION_ID } }),
      ).rejects.toThrow(/exact stored provider|not supported/);
    }
    expect(starts).toBe(0);

    for (const candidate of [
      profile({ start: "unsupported" }),
      profile({ observe: "unsupported" }),
      profile({ cancel: "unsupported" }),
    ]) {
      const fresh = createInteractionSession({
        conversationId: CONVERSATION_ID,
        agent: AGENT,
        runner: runner(candidate, () => {
          starts += 1;
          return nativeRun({ runId: RUN_ID, early: providerSession() });
        }),
        store: memoryStore().store,
        identity: sessionIdentity(`native-operation:${candidate.operations[0].disposition}`),
      });
      await expect(
        fresh.send({ input: "start", invocationContext: { invocationId: INVOCATION_ID } }),
      ).rejects.toThrow(/not supported|operation matrix/);
    }
    expect(starts).toBe(0);
  });

  test("rejects early provider drift and terminal identity substitution", async () => {
    const route = profile();
    const wrongProviderMemory = memoryStore();
    const wrongProvider = createInteractionSession({
      conversationId: CONVERSATION_ID,
      agent: AGENT,
      runner: runner(route, () =>
        nativeRun({ runId: RUN_ID, early: providerSession("provider.other") }),
      ),
      store: wrongProviderMemory.store,
      identity: sessionIdentity("native-wrong-provider"),
    });
    await expect(
      wrongProvider.send({ input: "start", invocationContext: { invocationId: INVOCATION_ID } }),
    ).rejects.toThrow("agree with the exact continuable route profile");
    expect(wrongProviderMemory.read()).toBeNull();

    const terminalMemory = memoryStore();
    const calls = { count: 0 };
    const substitutedSessionId = externalId<ProviderSessionId>("provider-session-substituted");
    const terminalSubstitution = createInteractionSession({
      conversationId: CONVERSATION_ID,
      agent: AGENT,
      runner: runner(route, () =>
        nativeRun({
          runId: RUN_ID,
          early: providerSession(),
          terminal: providerSession(route.providerId, substitutedSessionId),
          providerCalls: calls,
        }),
      ),
      store: terminalMemory.store,
      identity: sessionIdentity("native-terminal-substitution"),
    });
    const interaction = await terminalSubstitution.send({
      input: "start",
      invocationContext: { invocationId: INVOCATION_ID },
    });
    await expect(interaction.result()).rejects.toThrow("cached early provider session");
    expect(calls.count).toBe(1);
    expect(terminalMemory.read()).toBeNull();
  });
});
