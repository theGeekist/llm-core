import { describe, expect, test } from "bun:test";
import {
  contractVersion,
  externalId,
  newCoreId,
  type CorrelationId,
  type EventId,
  type PrincipalId,
} from "#contracts";
import {
  isAdmittedAgentActiveInput,
  registerNativeAgentConversationProfile,
  type AgentActiveInputAuthorityCapability,
  type AgentEvent,
  type AgentResult,
  type NativeAgentRun,
  type NativeAgentRunner,
} from "../../../src/features/agent/public";
import {
  createInteractionSession,
  registerConversationSnapshot,
  type ConversationSnapshot,
  type ConversationStore,
  type InteractionActiveInputRequest,
} from "../../../src/application/interaction/public";
import {
  AGENT,
  CONVERSATION_ID,
  INVOCATION_ID,
  PROVIDER_SESSION_ID,
  RUN_ID,
} from "./interaction-run-fixtures";

const NOW = "2026-08-25T02:00:00.000Z";
const EXPIRES = "2026-08-25T03:00:00.000Z";
const ISSUER = externalId<PrincipalId>("aifsd.application");

const memoryStore = (): ConversationStore => {
  let snapshot: ConversationSnapshot | null = null;
  let reservation: string | null = null;
  return {
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
};

const profile = registerNativeAgentConversationProfile({
  providerId: "provider.codex",
  routeProfileId: "codex.app-server",
  routeProfileVersion: contractVersion("1.0.0"),
  sourceContract: {
    authority: "Codex app-server",
    version: "0.148.0-alpha.9",
    revision: "codex-app-server-0.148.0-alpha.9",
  },
  operations: [
    {
      operation: "conversation.start",
      disposition: "supported",
      evidenceRefs: ["fixture:start"],
    },
    {
      operation: "conversation.continue",
      disposition: "supported",
      evidenceRefs: ["fixture:continue"],
    },
    {
      operation: "run.observe",
      disposition: "supported",
      evidenceRefs: ["fixture:observe"],
    },
    {
      operation: "run.input.submit",
      disposition: "supported",
      evidenceRefs: ["fixture:steer"],
      deliveryMode: "native-live",
    },
    {
      operation: "run.cancel",
      disposition: "supported",
      evidenceRefs: ["fixture:cancel"],
    },
  ],
});

const event = (
  kind: AgentEvent["kind"],
  sequence: number,
  facts: AgentEvent["facts"],
): AgentEvent =>
  ({
    eventId: newCoreId<EventId>(
      `018f0f4e-8c5b-7a91-8c3b-${String(sequence + 100).padStart(12, "0")}`,
    ),
    kind,
    occurredAt: NOW,
    sequence,
    identity: { runId: RUN_ID },
    facts,
  }) as AgentEvent;

const authority = (
  authorityId: string,
  expiresAt = EXPIRES,
): AgentActiveInputAuthorityCapability => ({
  kind: "agent-active-input-authority",
  authorityId,
  issuer: ISSUER,
  scope: {
    operation: "run.input.submit",
    conversationId: CONVERSATION_ID,
    runId: RUN_ID,
  },
  revision: 1,
  issuedAt: "2026-08-25T01:00:00.000Z",
  expiresAt,
});

const submission = (
  id: string,
  inputAuthority = authority(`authority:${id}`),
): InteractionActiveInputRequest => ({
  request: {
    messageId: `message:${id}`,
    correlationId: externalId<CorrelationId>(`correlation:${id}`),
    submittedAt: NOW,
    content: { kind: "text", text: `Input ${id}` },
  },
  authority: inputAuthority,
});

describe("interaction active input", () => {
  test("exposes provider identity early and admits input without replacing the active run", async () => {
    let finishRun!: () => void;
    const finish = new Promise<void>((resolve) => {
      finishRun = resolve;
    });
    let submitCalls = 0;
    let evidenceCalls = 0;
    let startCalls = 0;
    const nativeRun: NativeAgentRun = {
      identity: { runId: RUN_ID },
      async *events() {
        yield event("agent.run.started", 0, {
          agentId: AGENT.agentId,
          agentVersion: AGENT.version,
        });
        await finish;
        yield event("agent.run.input.accepted", 1, {
          messageId: "message:accepted",
          correlationId: externalId<CorrelationId>("correlation:accepted"),
          acceptedAt: NOW,
          deliveryMode: "native-live",
        });
        yield event("agent.run.input.recipient-observed", 2, {
          messageId: "message:accepted",
          correlationId: externalId<CorrelationId>("correlation:accepted"),
          observedAt: NOW,
          evidenceRef: "evidence:recipient",
        });
        yield event("agent.run.input.processing-observed", 3, {
          messageId: "message:accepted",
          correlationId: externalId<CorrelationId>("correlation:accepted"),
          observedAt: NOW,
          causationRef: "provider-event:processing",
        });
        yield event("agent.run.input.evidence-unavailable", 4, {
          messageId: "message:accepted",
          correlationId: externalId<CorrelationId>("correlation:accepted"),
          stage: "semantic-processing",
          declaredAt: NOW,
          reasonCode: "provider-unobservable",
        });
        yield event("agent.run.completed", 5, { status: "completed" });
      },
      async result(): Promise<AgentResult> {
        await finish;
        return {
          identity: { runId: RUN_ID },
          status: "completed",
          output: { kind: "text", text: "done" },
        };
      },
      cancel: () => ({ status: "acknowledged", acknowledgedAt: NOW }),
      intervene: () => ({ status: "unsupported", acknowledgedAt: NOW }),
      providerSession: () => ({
        kind: "provider-session-ref",
        providerId: "provider.codex",
        sessionId: PROVIDER_SESSION_ID,
      }),
      submitInput: (input) => {
        expect(isAdmittedAgentActiveInput(input)).toBe(true);
        submitCalls += 1;
        return {
          status: "accepted",
          messageId: input.messageId,
          correlationId: input.correlationId,
          acknowledgedAt: NOW,
        };
      },
      activeInputEvidence: (identity) => {
        evidenceCalls += 1;
        return {
          status: "unavailable",
          messageId: identity.messageId,
          correlationId: identity.correlationId,
          stage: "semantic-processing",
          declaredAt: NOW,
          reasonCode: "provider-unobservable",
        };
      },
    };
    const runner: NativeAgentRunner = {
      capabilities: () => ({
        runnerId: "test.native-runner",
        runnerVersion: contractVersion("1.0.0"),
        controlledEffects: false,
        cancellation: "cooperative",
        interventions: false,
        checkpointResume: false,
        providerSessionContinuation: true,
        durableExecutionSignalling: false,
        childRuns: false,
        nativeConversation: profile,
      }),
      prepare: () => AGENT,
      start: () => {
        startCalls += 1;
        return nativeRun;
      },
    };
    const store = memoryStore();
    const session = createInteractionSession({
      conversationId: CONVERSATION_ID,
      agent: AGENT,
      runner,
      store,
      identity: {
        now: () => NOW,
        newSnapshotId: () => "snapshot:native-active",
        newReservationId: () => "reservation:native-active",
      },
      activeInputAuthority: {
        verify: ({ authority: candidate }) => {
          if (candidate.authorityId === "authority:forged") return { status: "forged" };
          if (candidate.authorityId === "authority:unauthorised") {
            return { status: "unauthorised" };
          }
          return { status: "verified", issuer: ISSUER, revision: 1 };
        },
      },
    });

    const interaction = await session.send({
      input: { text: "start" },
      invocationContext: { invocationId: INVOCATION_ID },
    });
    let terminalSettled = false;
    void interaction.result().then(() => {
      terminalSettled = true;
    });

    expect(await interaction.providerSession()).toEqual(
      expect.objectContaining({ sessionId: PROVIDER_SESSION_ID }),
    );
    expect(terminalSettled).toBe(false);

    expect(await session.submitInput(submission("forged"))).toEqual(
      expect.objectContaining({ status: "rejected", reasonCode: "forged-authority" }),
    );
    expect(await session.submitInput(submission("unauthorised"))).toEqual(
      expect.objectContaining({ status: "rejected", reasonCode: "unauthorised" }),
    );
    expect(
      await session.submitInput(
        submission("stale", authority("authority:stale", "2026-08-25T01:30:00.000Z")),
      ),
    ).toEqual(expect.objectContaining({ status: "rejected", reasonCode: "stale-authority" }));
    expect(submitCalls).toBe(0);

    const accepted = await session.submitInput(submission("accepted"));
    expect(accepted.status).toBe("accepted");
    expect(interaction.runId).toBe(RUN_ID);
    expect(startCalls).toBe(1);
    expect(submitCalls).toBe(1);
    expect(
      await session.submitInput({
        ...submission("duplicate-message"),
        request: {
          ...submission("duplicate-message").request,
          messageId: "message:accepted",
        },
      }),
    ).toEqual(expect.objectContaining({ status: "rejected", reasonCode: "duplicate-input" }));
    expect(
      await session.submitInput({
        ...submission("duplicate-correlation"),
        request: {
          ...submission("duplicate-correlation").request,
          correlationId: externalId<CorrelationId>("correlation:accepted"),
        },
      }),
    ).toEqual(expect.objectContaining({ status: "rejected", reasonCode: "duplicate-input" }));
    expect(submitCalls).toBe(1);
    await expect(
      interaction.activeInputEvidence({
        messageId: "message:wrong",
        correlationId: externalId<CorrelationId>("correlation:accepted"),
      }),
    ).rejects.toThrow("exact message and correlation pair");
    expect(evidenceCalls).toBe(0);
    expect(
      await interaction.activeInputEvidence({
        messageId: "message:accepted",
        correlationId: externalId<CorrelationId>("correlation:accepted"),
      }),
    ).toEqual(expect.objectContaining({ status: "unavailable", stage: "semantic-processing" }));
    expect(evidenceCalls).toBe(1);

    finishRun();
    const result = await interaction.result();
    expect(result.snapshot.value.providerSession?.sessionId).toBe(PROVIDER_SESSION_ID);
    const reloaded = await createInteractionSession({
      conversationId: CONVERSATION_ID,
      agent: AGENT,
      runner,
      store,
      identity: {
        now: () => NOW,
        newSnapshotId: () => "snapshot:native-reload",
        newReservationId: () => "reservation:native-reload",
      },
      activeInputAuthority: { verify: () => ({ status: "unauthorised" }) },
    }).load();
    expect(reloaded.value.projection.events.slice(-5).map(({ kind }) => kind)).toEqual([
      "active-input-accepted",
      "active-input-recipient-observed",
      "active-input-processing-observed",
      "active-input-evidence-unavailable",
      "run-finished",
    ]);
    expect(reloaded.value.projection.status).toBe("completed");
    expect(reloaded.value.projection.acceptedActiveInputs).toEqual([
      {
        runId: RUN_ID,
        messageId: "message:accepted",
        correlationId: externalId<CorrelationId>("correlation:accepted"),
      },
    ]);
    const outOfOrder = structuredClone(reloaded) as unknown as {
      value: {
        projection: {
          eventIds: string[];
          events: Array<Record<string, unknown>>;
        };
      };
    };
    const acceptedIndex = outOfOrder.value.projection.events.findIndex(
      (item) => item.kind === "active-input-accepted",
    );
    const recipientIndex = outOfOrder.value.projection.events.findIndex(
      (item) => item.kind === "active-input-recipient-observed",
    );
    [
      outOfOrder.value.projection.events[acceptedIndex],
      outOfOrder.value.projection.events[recipientIndex],
    ] = [
      outOfOrder.value.projection.events[recipientIndex]!,
      outOfOrder.value.projection.events[acceptedIndex]!,
    ];
    outOfOrder.value.projection.eventIds = outOfOrder.value.projection.events.map(
      (item) => item.eventId as string,
    );
    expect(() => registerConversationSnapshot(outOfOrder, CONVERSATION_ID)).toThrow(
      "exact prior accepted message and correlation",
    );
    const wrongIndex = structuredClone(reloaded) as unknown as {
      value: {
        projection: {
          acceptedActiveInputs: Array<Record<string, unknown>>;
        };
      };
    };
    wrongIndex.value.projection.acceptedActiveInputs[0]!.messageId = "message:wrong-index";
    expect(() => registerConversationSnapshot(wrongIndex, CONVERSATION_ID)).toThrow(
      "active-input lifecycle indexes",
    );
    for (const kind of [
      "active-input-accepted",
      "active-input-recipient-observed",
      "active-input-processing-observed",
      "active-input-evidence-unavailable",
    ]) {
      const tainted = structuredClone(reloaded) as unknown as {
        value: { projection: { events: Array<Record<string, unknown>> } };
      };
      const projected = tainted.value.projection.events.find((item) => item.kind === kind)!;
      projected.providerPayload = { credential: "must-not-reload" };
      expect(() => registerConversationSnapshot(tainted, CONVERSATION_ID)).toThrow(
        "closed safe shape",
      );
    }
    expect(await session.submitInput(submission("late"))).toEqual(
      expect.objectContaining({ status: "already-terminal" }),
    );
    expect(submitCalls).toBe(1);
  });

  test("rechecks expiry after a deferred verifier before native ingress", async () => {
    let currentTime = NOW;
    let finishRun!: () => void;
    let releaseVerifier!: () => void;
    let verifierStarted!: () => void;
    const finish = new Promise<void>((resolve) => {
      finishRun = resolve;
    });
    const verifierGate = new Promise<void>((resolve) => {
      releaseVerifier = resolve;
    });
    const verifierEntered = new Promise<void>((resolve) => {
      verifierStarted = resolve;
    });
    let submitCalls = 0;
    const nativeRun: NativeAgentRun = {
      identity: { runId: RUN_ID },
      async *events() {
        yield event("agent.run.started", 0, {
          agentId: AGENT.agentId,
          agentVersion: AGENT.version,
        });
        await finish;
        yield event("agent.run.completed", 1, { status: "completed" });
      },
      async result() {
        await finish;
        return { identity: { runId: RUN_ID }, status: "completed" };
      },
      cancel: () => ({ status: "acknowledged", acknowledgedAt: currentTime }),
      intervene: () => ({ status: "unsupported", acknowledgedAt: currentTime }),
      providerSession: () => ({
        kind: "provider-session-ref",
        providerId: profile.providerId,
        sessionId: PROVIDER_SESSION_ID,
      }),
      submitInput: (input) => {
        submitCalls += 1;
        return {
          status: "accepted",
          messageId: input.messageId,
          correlationId: input.correlationId,
          acknowledgedAt: currentTime,
        };
      },
      activeInputEvidence: (identity) => ({
        status: "unavailable",
        ...identity,
        stage: "semantic-processing",
        declaredAt: currentTime,
        reasonCode: "provider-unobservable",
      }),
    };
    const runner: NativeAgentRunner = {
      capabilities: () => ({
        runnerId: "test.deferred-native-runner",
        runnerVersion: contractVersion("1.0.0"),
        controlledEffects: false,
        cancellation: "cooperative",
        interventions: false,
        checkpointResume: false,
        providerSessionContinuation: true,
        durableExecutionSignalling: false,
        childRuns: false,
        nativeConversation: profile,
      }),
      prepare: () => AGENT,
      start: () => nativeRun,
    };
    const session = createInteractionSession({
      conversationId: CONVERSATION_ID,
      agent: AGENT,
      runner,
      store: memoryStore(),
      identity: {
        now: () => currentTime,
        newSnapshotId: () => "snapshot:deferred-expiry",
        newReservationId: () => "reservation:deferred-expiry",
      },
      activeInputAuthority: {
        verify: async () => {
          verifierStarted();
          await verifierGate;
          return { status: "verified", issuer: ISSUER, revision: 1 };
        },
      },
    });
    const interaction = await session.send({
      input: { text: "start" },
      invocationContext: { invocationId: INVOCATION_ID },
    });

    const pendingSubmission = session.submitInput(submission("deferred"));
    await verifierEntered;
    currentTime = EXPIRES;
    releaseVerifier();

    await expect(pendingSubmission).resolves.toEqual(
      expect.objectContaining({ status: "rejected", reasonCode: "stale-authority" }),
    );
    expect(submitCalls).toBe(0);
    finishRun();
    await interaction.result();
  });
});
