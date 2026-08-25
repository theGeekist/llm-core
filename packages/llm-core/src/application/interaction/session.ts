import {
  isCanonicalUuid,
  isExternalId,
  isJsonValue,
  isUuidV7,
  type ConversationId,
  type JsonValue,
  type RunId,
} from "#contracts";
import {
  createLiveContinuation,
  createSnapshot,
  isLiveContinuation,
  type LiveContinuation,
  type ProviderSessionRef,
} from "../../features/state/public";
import type { ToolExecutionEvent } from "../../features/evidence/public";
import {
  admitAgentActiveInput,
  createAgentActiveInputRejection,
  isAgentOutput,
  isNativeAgentRun,
  nativeAgentConversationContinuity,
  nativeAgentOperation,
  registerAgentActiveInputAcknowledgement,
  registerAgentActiveInputProcessingEvidence,
  registerAgentActiveInputRequest,
  type AgentResult,
  type RegisteredNativeAgentConversationProfile,
} from "../../features/agent/public";
import { interactionContentEvent, interactionExecutionEvent, interactionRunId } from "./events";
import {
  createInteractionProjection,
  observeInteractionAgentEvents,
  reduceInteractionProjection,
  type InteractionTerminalObservation,
} from "./projection";
import { registerConversationSnapshot } from "./registration";
import { AsyncEventLog } from "../async-event-log";
import type {
  ConversationStoreReservation,
  ConversationSnapshot,
  ConversationState,
  CreateInteractionSessionOptions,
  InteractionEvent,
  RegisteredInteractionContentEvent,
  InteractionLiveConnection,
  InteractionRun,
  InteractionRunResult,
  InteractionSession,
} from "./types";
import { isSafeInteractionCode } from "./content-registration";
import {
  readEarlyNativeProviderSession,
  resolveInteractionProviderSession,
  resolveNativeConversationRoute,
} from "./native-route";

const emptyValue = (conversationId: ConversationId): ConversationState => ({
  conversationId,
  revision: 0,
  turns: Object.freeze([]),
  projection: createInteractionProjection(conversationId),
});

interface ActiveInteractionRun {
  readonly runId: RunId;
  readonly log: AsyncEventLog<InteractionEvent>;
  readonly agentRun: InteractionRun["agentRun"];
  readonly nativeConversation?: RegisteredNativeAgentConversationProfile;
  readonly inputMessageIds: Set<string>;
  readonly inputCorrelationIds: Set<string>;
  readonly acceptedInputMessages: Map<string, string>;
  projection: ConversationState["projection"];
}

const requireMatchingAgentResult = (
  runId: RunId,
  terminal: InteractionTerminalObservation,
  run: AgentResult,
): void => {
  if (run.identity.runId !== runId) {
    throw new TypeError("Agent results must bind to the active run.");
  }
  if (terminal.status !== run.status) {
    throw new TypeError("Agent result status must agree with its terminal event.");
  }
  if (
    run.reasonCode !== terminal.reasonCode ||
    (run.reasonCode !== undefined && !isSafeInteractionCode(run.reasonCode))
  ) {
    throw new TypeError("Agent result reason code must safely agree with its terminal event.");
  }
  if (run.output !== undefined && !isAgentOutput(run.output)) {
    throw new TypeError("Agent output must use the closed portable result contract.");
  }
};

const asSnapshot = (
  options: CreateInteractionSessionOptions,
  value: ConversationState,
): ConversationSnapshot => {
  const events = [...value.projection.events];
  const terminalRunIds = events
    .filter((event) => event.kind === "run-finished")
    .map((event) => event.runId);
  const terminalMessageKeys = events
    .filter((event) => event.kind === "message-finished" || event.kind === "message-failed")
    .map((event) => `${event.runId}:${event.messageId}`);
  const startedMessageKeys = events
    .filter((event) => event.kind === "message-started")
    .map((event) => `${event.runId}:${event.messageId}`);
  const seenToolCallKeys = events
    .filter((event) => event.kind === "tool-call")
    .map((event) => `${event.runId}:${event.toolCallId}`);
  const acceptedActiveInputs = events.flatMap((event) =>
    event.kind === "active-input-accepted"
      ? [
          {
            runId: event.runId,
            messageId: event.messageId,
            correlationId: event.correlationId,
          },
        ]
      : [],
  );
  const persistedValue: ConversationState = {
    ...value,
    projection: {
      ...value.projection,
      eventIds: events.map((event) => event.eventId),
      eventFingerprints: {},
      events,
      lastSequences: {},
      terminalRunIds: [...new Set(terminalRunIds)],
      terminalMessageKeys: [...new Set(terminalMessageKeys)],
      startedMessageKeys: [...new Set(startedMessageKeys)],
      seenToolCallKeys: [...new Set(seenToolCallKeys)],
      acceptedActiveInputs,
    },
  };
  return createSnapshot({
    snapshotId: options.identity.newSnapshotId(),
    createdAt: options.identity.now(),
    value: persistedValue as unknown as JsonValue,
  }) as unknown as ConversationSnapshot;
};

export const createInteractionSession = (
  options: CreateInteractionSessionOptions,
): InteractionSession => {
  if (!isCanonicalUuid(options.conversationId)) {
    throw new TypeError("Interaction sessions require a canonical conversation ID.");
  }
  let current = asSnapshot(options, emptyValue(options.conversationId));
  let active: ActiveInteractionRun | undefined;
  let busy = false;
  let startingEvents: InteractionEvent[] | undefined;

  const releaseReservation = async (
    reservation: ConversationStoreReservation | undefined,
  ): Promise<void> => {
    if (!reservation) {
      return;
    }
    try {
      await options.store.release(reservation);
    } catch {
      // Release is cleanup, not commit authority. A conforming store makes it
      // idempotent; recovery of an unreachable store is host-owned.
    }
  };

  const load = async (): Promise<ConversationSnapshot> => {
    const loaded = await options.store.load({ conversationId: options.conversationId });
    if (loaded) {
      current = registerConversationSnapshot(loaded, options.conversationId);
    }
    return current;
  };

  const emitEvent = async (event: InteractionEvent): Promise<void> => {
    if (!active && startingEvents) {
      startingEvents.push(event);
      return;
    }
    if (!active || interactionRunId(event) !== active.runId) {
      throw new TypeError("Interaction events must bind to the active conversation run.");
    }
    active.projection = reduceInteractionProjection(active.projection, event);
    active.log.append(event);
  };

  const executionEventSink = Object.freeze({
    emit: async (source: ToolExecutionEvent) => {
      const event = interactionExecutionEvent(options.conversationId, source);
      await emitEvent(event);
    },
  });

  const emitContent = async (source: RegisteredInteractionContentEvent): Promise<void> =>
    emitEvent(interactionContentEvent(options.conversationId, source));

  const reconnect = (
    continuation: LiveContinuation<InteractionLiveConnection>,
  ): InteractionLiveConnection => {
    if (!isLiveContinuation(continuation)) {
      throw new TypeError("Reconnect requires a process-local LiveContinuation.");
    }
    if (continuation.value.conversationId !== options.conversationId) {
      throw new TypeError("Live continuations cannot cross conversation boundaries.");
    }
    return continuation.value;
  };

  const inputOutcome = (
    request: ReturnType<typeof registerAgentActiveInputRequest>,
    status: "already-terminal" | "unsupported",
  ) =>
    registerAgentActiveInputAcknowledgement(
      {
        status,
        messageId: request.messageId,
        correlationId: request.correlationId,
        acknowledgedAt: options.identity.now(),
      },
      request,
    );

  const submitInput: InteractionSession["submitInput"] = async (submission) => {
    const request = registerAgentActiveInputRequest(submission.request);
    const target = active;
    if (!target) {
      return inputOutcome(request, "already-terminal");
    }
    if (!target.nativeConversation) {
      return inputOutcome(request, "unsupported");
    }
    const operation = nativeAgentOperation(target.nativeConversation, "run.input.submit");
    if (operation.disposition !== "supported") {
      return inputOutcome(request, "unsupported");
    }
    if (!isNativeAgentRun(target.agentRun)) {
      throw new TypeError("A supported active-input profile requires a native AgentRun surface.");
    }
    if (!options.activeInputAuthority) {
      return createAgentActiveInputRejection(request, "unauthorised", options.identity.now());
    }
    const admission = await admitAgentActiveInput({
      request,
      authority: submission.authority,
      conversationId: options.conversationId,
      runId: target.runId,
      clock: options.identity,
      verifier: options.activeInputAuthority,
    });
    if (admission.status === "rejected") {
      return createAgentActiveInputRejection(request, admission.reasonCode, options.identity.now());
    }
    if (!active || active.runId !== target.runId) {
      return inputOutcome(request, "already-terminal");
    }
    if (
      target.inputMessageIds.has(request.messageId) ||
      target.inputCorrelationIds.has(request.correlationId)
    ) {
      return createAgentActiveInputRejection(request, "duplicate-input", options.identity.now());
    }
    target.inputMessageIds.add(request.messageId);
    target.inputCorrelationIds.add(request.correlationId);
    const acknowledgement = registerAgentActiveInputAcknowledgement(
      await target.agentRun.submitInput(admission.input),
      request,
    );
    if (acknowledgement.status === "accepted") {
      target.acceptedInputMessages.set(request.correlationId, request.messageId);
    }
    return acknowledgement;
  };

  const requireSendRequest = (request: Parameters<InteractionSession["send"]>[0]): JsonValue => {
    if (
      request.invocationContext.conversationId !== undefined &&
      request.invocationContext.conversationId !== options.conversationId
    ) {
      throw new TypeError("Invocation and session conversation identities must match.");
    }
    if (!isJsonValue(request.input)) {
      throw new TypeError("Interaction input must be strict portable JSON.");
    }
    return structuredClone(request.input);
  };

  const reserveCurrent = async (
    loaded: ConversationSnapshot,
  ): Promise<ConversationStoreReservation> => {
    const reservationId = options.identity.newReservationId();
    if (!isExternalId(reservationId)) {
      throw new TypeError("Conversation reservation IDs must be opaque external IDs.");
    }
    const reservation = await options.store.reserve({
      conversationId: options.conversationId,
      expectedRevision: loaded.value.revision,
      reservationId,
    });
    if (
      reservation === null ||
      reservation.conversationId !== options.conversationId ||
      reservation.expectedRevision !== loaded.value.revision ||
      reservation.reservationId !== reservationId
    ) {
      throw new Error("Conversation session could not reserve its current revision.");
    }
    return reservation;
  };

  const startAgentRun = async (input: {
    readonly request: Parameters<InteractionSession["send"]>[0];
    readonly loaded: ConversationSnapshot;
    readonly submittedInput: JsonValue;
    readonly nativeConversation: RegisteredNativeAgentConversationProfile | undefined;
  }): Promise<{
    readonly agentRun: InteractionRun["agentRun"];
    readonly earlyProviderSession: ProviderSessionRef | undefined;
  }> => {
    const agentRun = await options.runner.start({
      agent: options.agent,
      invocationContext: structuredClone({
        ...input.request.invocationContext,
        conversationId: options.conversationId,
      }),
      input: structuredClone(input.submittedInput),
      ...(input.loaded.value.providerSession
        ? { providerSession: input.loaded.value.providerSession }
        : {}),
    });
    if (!isUuidV7(agentRun.identity.runId)) {
      throw new TypeError("New interaction agent runs must use UUIDv7 run IDs.");
    }
    if (input.nativeConversation === undefined) {
      return { agentRun, earlyProviderSession: input.loaded.value.providerSession };
    }
    if (!isNativeAgentRun(agentRun)) {
      throw new TypeError("A native-agent route profile requires the complete native run surface.");
    }
    return {
      agentRun,
      earlyProviderSession: await readEarlyNativeProviderSession(
        agentRun,
        input.nativeConversation,
      ),
    };
  };

  const activateAgentRun = (
    loaded: ConversationSnapshot,
    agentRun: InteractionRun["agentRun"],
    nativeConversation: RegisteredNativeAgentConversationProfile | undefined,
  ): ActiveInteractionRun => {
    const log = new AsyncEventLog<InteractionEvent>();
    const activation: ActiveInteractionRun = {
      runId: agentRun.identity.runId,
      log,
      agentRun,
      ...(nativeConversation ? { nativeConversation } : {}),
      inputMessageIds: new Set<string>(),
      inputCorrelationIds: new Set<string>(),
      acceptedInputMessages: new Map<string, string>(),
      projection: loaded.value.projection,
    };
    active = activation;
    for (const event of startingEvents ?? []) {
      if (interactionRunId(event) !== activation.runId) {
        throw new TypeError("Execution events must bind to the active conversation run.");
      }
      activation.projection = reduceInteractionProjection(activation.projection, event);
      log.append(event);
    }
    startingEvents = undefined;
    return activation;
  };

  const settleRun = async (input: {
    readonly loaded: ConversationSnapshot;
    readonly submittedInput: JsonValue;
    readonly activation: ActiveInteractionRun;
    readonly reservation: ConversationStoreReservation;
    readonly earlyProviderSession: ProviderSessionRef | undefined;
    readonly nativeConversation: RegisteredNativeAgentConversationProfile | undefined;
  }): Promise<InteractionRunResult> => {
    try {
      const terminal = await observeInteractionAgentEvents({
        conversationId: options.conversationId,
        runId: input.activation.runId,
        events: input.activation.agentRun.events(),
        emit: (event) => {
          input.activation.projection = reduceInteractionProjection(
            input.activation.projection,
            event,
          );
          input.activation.log.append(event);
        },
      });
      const run = await input.activation.agentRun.result();
      requireMatchingAgentResult(input.activation.runId, terminal, run);
      const providerSession = resolveInteractionProviderSession({
        terminal: run.providerSession,
        early: input.earlyProviderSession,
        nativeConversation: input.nativeConversation,
      });
      const output = run.output === undefined ? {} : { output: structuredClone(run.output) };
      const value: ConversationState = {
        conversationId: options.conversationId,
        revision: input.loaded.value.revision + 1,
        turns: [
          ...input.loaded.value.turns,
          {
            runId: run.identity.runId,
            input: input.submittedInput,
            status: run.status,
            ...output,
            ...(run.reasonCode ? { reasonCode: run.reasonCode } : {}),
          },
        ],
        projection: input.activation.projection,
        ...(providerSession ? { providerSession } : {}),
        ...(providerSession && input.nativeConversation
          ? { nativeConversation: nativeAgentConversationContinuity(input.nativeConversation) }
          : {}),
      };
      const snapshot = asSnapshot(options, value);
      const saved = await options.store.save({
        conversationId: options.conversationId,
        expectedRevision: input.loaded.value.revision,
        reservationId: input.reservation.reservationId,
        snapshot,
      });
      if (saved !== "saved") {
        throw new Error("Conversation session revision conflicted during persistence.");
      }
      current = snapshot;
      return Object.freeze({ conversationId: options.conversationId, run, snapshot });
    } finally {
      input.activation.log.close();
      active = undefined;
      busy = false;
      await releaseReservation(input.reservation);
    }
  };

  const send = async (
    request: Parameters<InteractionSession["send"]>[0],
  ): Promise<InteractionRun> => {
    if (busy) {
      throw new TypeError("A conversation session cannot start concurrent runs.");
    }
    busy = true;
    startingEvents = [];
    let loaded: ConversationSnapshot;
    let agentRun: InteractionRun["agentRun"];
    let log: AsyncEventLog<InteractionEvent>;
    let submittedInput: JsonValue;
    let nativeConversation: RegisteredNativeAgentConversationProfile | undefined;
    let earlyProviderSession: ProviderSessionRef | undefined;
    let reservation: ConversationStoreReservation | undefined;
    let activation: ActiveInteractionRun;
    try {
      loaded = await load();
      submittedInput = requireSendRequest(request);
      reservation = await reserveCurrent(loaded);
      const capabilities = await options.runner.capabilities();
      nativeConversation =
        resolveNativeConversationRoute({
          capabilities,
          ...(loaded.value.providerSession
            ? { storedProviderSession: loaded.value.providerSession }
            : {}),
          ...(loaded.value.nativeConversation
            ? { storedContinuity: loaded.value.nativeConversation }
            : {}),
        }) ?? undefined;
      const started = await startAgentRun({
        request,
        loaded,
        submittedInput,
        nativeConversation,
      });
      agentRun = started.agentRun;
      earlyProviderSession = started.earlyProviderSession;
      activation = activateAgentRun(loaded, agentRun, nativeConversation);
      log = activation.log;
    } catch (error) {
      startingEvents = undefined;
      active = undefined;
      busy = false;
      await releaseReservation(reservation);
      throw error;
    }

    const acceptedInputMessages = activation.acceptedInputMessages;

    const readProviderSession = async () => earlyProviderSession;
    const resultPromise = settleRun({
      loaded,
      submittedInput,
      activation,
      reservation,
      earlyProviderSession,
      nativeConversation,
    });

    const connection: InteractionLiveConnection = Object.freeze({
      conversationId: options.conversationId,
      runId: agentRun.identity.runId,
      events: () => log.stream(),
      result: () => resultPromise,
    });
    const activeInputEvidence: InteractionRun["activeInputEvidence"] = async (identity) => {
      if (
        !isExternalId(identity.messageId) ||
        !isExternalId(identity.correlationId) ||
        acceptedInputMessages.get(identity.correlationId) !== identity.messageId
      ) {
        throw new TypeError(
          "Active-input evidence requires an accepted exact message and correlation pair.",
        );
      }
      if (!nativeConversation || !isNativeAgentRun(agentRun)) {
        throw new TypeError("The selected runner does not expose active-input evidence.");
      }
      return registerAgentActiveInputProcessingEvidence(
        await agentRun.activeInputEvidence(identity),
        identity,
      );
    };
    return Object.freeze({
      ...connection,
      continuation: createLiveContinuation(connection),
      agentRun,
      providerSession: readProviderSession,
      activeInputEvidence,
    });
  };

  return Object.freeze({
    conversationId: options.conversationId,
    executionEventSink,
    emitContent,
    load,
    send,
    submitInput,
    reconnect,
  });
};
