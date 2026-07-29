import {
  isCanonicalUuid,
  isExternalId,
  isJsonValue,
  type ConversationId,
  type JsonValue,
  type RunId,
} from "#contracts";
import {
  createLiveContinuation,
  createProviderSessionRef,
  createSnapshot,
  isLiveContinuation,
  type LiveContinuation,
} from "../../features/state/public";
import type { ExecutionEvent } from "../../features/evidence/public";
import {
  interactionAgentEvent,
  interactionContentEvent,
  interactionExecutionEvent,
  interactionRunId,
} from "./events";
import { createInteractionProjection, reduceInteractionProjection } from "./projection";
import { registerConversationSessionSnapshot } from "./registration";
import type {
  ConversationSessionReservation,
  ConversationSessionSnapshot,
  ConversationSessionValue,
  CreateInteractionSessionOptions,
  InteractionEvent,
  InteractionContentEvent,
  InteractionLiveConnection,
  InteractionRun,
  InteractionRunResult,
  InteractionSession,
} from "./types";

class InteractionEventLog {
  readonly #events: InteractionEvent[] = [];
  readonly #waiters = new Set<() => void>();
  #closed = false;

  append(event: InteractionEvent): void {
    if (this.#closed) {
      return;
    }
    this.#events.push(event);
    for (const wake of this.#waiters) {
      wake();
    }
    this.#waiters.clear();
  }

  close(): void {
    this.#closed = true;
    for (const wake of this.#waiters) {
      wake();
    }
    this.#waiters.clear();
  }

  stream(): AsyncIterable<InteractionEvent> {
    const events = this.#events;
    const waiters = this.#waiters;
    const closed = () => this.#closed;
    return {
      async *[Symbol.asyncIterator]() {
        let index = 0;
        while (true) {
          while (index < events.length) {
            const event = events[index++];
            if (event) {
              yield event;
            }
          }
          if (closed()) {
            return;
          }
          await new Promise<void>((resolve) => waiters.add(resolve));
        }
      },
    };
  }
}

const emptyValue = (conversationId: ConversationId): ConversationSessionValue => ({
  conversationId,
  revision: 0,
  turns: Object.freeze([]),
  projection: createInteractionProjection(conversationId),
});

const asSnapshot = (
  options: CreateInteractionSessionOptions,
  value: ConversationSessionValue,
): ConversationSessionSnapshot =>
  createSnapshot({
    snapshotId: options.identity.newSnapshotId(),
    createdAt: options.identity.now(),
    value: value as unknown as JsonValue,
  }) as unknown as ConversationSessionSnapshot;

export const createInteractionSession = (
  options: CreateInteractionSessionOptions,
): InteractionSession => {
  if (!isCanonicalUuid(options.conversationId)) {
    throw new TypeError("Interaction sessions require a canonical conversation ID.");
  }
  let current = asSnapshot(options, emptyValue(options.conversationId));
  let active:
    | {
        readonly runId: RunId;
        readonly log: InteractionEventLog;
        projection: ConversationSessionValue["projection"];
      }
    | undefined;
  let busy = false;
  let startingEvents: InteractionEvent[] | undefined;

  const load = async (): Promise<ConversationSessionSnapshot> => {
    const loaded = await options.store.load({ conversationId: options.conversationId });
    if (loaded) {
      current = registerConversationSessionSnapshot(loaded, options.conversationId);
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
    emit: async (source: ExecutionEvent) => {
      const event = interactionExecutionEvent(options.conversationId, source);
      await emitEvent(event);
    },
  });

  const emitContent = async (source: InteractionContentEvent): Promise<void> =>
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

  const send = async (
    request: Parameters<InteractionSession["send"]>[0],
    // eslint-disable-next-line sonarjs/cognitive-complexity -- reservation and activation form one atomic lifecycle boundary
  ): Promise<InteractionRun> => {
    if (busy) {
      throw new TypeError("A conversation session cannot start concurrent runs.");
    }
    busy = true;
    startingEvents = [];
    let loaded: ConversationSessionSnapshot;
    let agentRun: InteractionRun["agentRun"];
    let log: InteractionEventLog;
    let submittedInput: JsonValue;
    let reservation: ConversationSessionReservation | undefined;
    try {
      loaded = await load();
      if (
        request.invocationContext.conversationId !== undefined &&
        request.invocationContext.conversationId !== options.conversationId
      ) {
        throw new TypeError("Invocation and session conversation identities must match.");
      }
      if (!isJsonValue(request.input)) {
        throw new TypeError("Interaction input must be strict portable JSON.");
      }
      const reservationId = options.identity.newReservationId();
      if (!isExternalId(reservationId)) {
        throw new TypeError("Conversation reservation IDs must be opaque external IDs.");
      }
      reservation = await options.store.reserve({
        conversationId: options.conversationId,
        expectedRevision: loaded.value.revision,
        reservationId,
      }) ?? undefined;
      if (
        !reservation ||
        reservation.conversationId !== options.conversationId ||
        reservation.expectedRevision !== loaded.value.revision ||
        reservation.reservationId !== reservationId
      ) {
        throw new Error("Conversation session could not reserve its current revision.");
      }
      const capabilities = await options.runner.capabilities();
      if (loaded.value.providerSession && !capabilities.providerSessionContinuation) {
        throw new TypeError(
          "The selected runner cannot continue the stored provider session.",
        );
      }
      submittedInput = structuredClone(request.input);
      agentRun = await options.runner.start({
        agent: options.agent,
        invocationContext: structuredClone({
          ...request.invocationContext,
          conversationId: options.conversationId,
        }),
        input: structuredClone(submittedInput),
        ...(loaded.value.providerSession
          ? { providerSession: loaded.value.providerSession }
          : {}),
      });
      if (!isCanonicalUuid(agentRun.identity.runId)) {
        throw new TypeError("Agent runs must return a canonical run ID.");
      }
      log = new InteractionEventLog();
      active = {
        runId: agentRun.identity.runId,
        log,
        projection: loaded.value.projection,
      };
      for (const event of startingEvents) {
        if (interactionRunId(event) !== agentRun.identity.runId) {
          throw new TypeError("Execution events must bind to the active conversation run.");
        }
        active.projection = reduceInteractionProjection(active.projection, event);
        log.append(event);
      }
      startingEvents = undefined;
    } catch (error) {
      if (reservation) {
        await options.store.release(reservation);
      }
      startingEvents = undefined;
      active = undefined;
      busy = false;
      throw error;
    }

    // eslint-disable-next-line sonarjs/cognitive-complexity -- terminal validation and persistence must settle in one guarded path
    const resultPromise = (async (): Promise<InteractionRunResult> => {
      let terminalStatus: InteractionRunResult["run"]["status"] | undefined;
      try {
        for await (const source of agentRun.events()) {
          if (source.identity.runId !== agentRun.identity.runId) {
            throw new TypeError("Agent events must bind to the active run.");
          }
          if (
            source.kind === "agent.run.completed" ||
            source.kind === "agent.run.failed" ||
            source.kind === "agent.run.denied" ||
            source.kind === "agent.run.cancelled"
          ) {
            if (terminalStatus) {
              throw new TypeError("Agent runs can emit exactly one terminal event.");
            }
            terminalStatus = source.facts.status;
          }
          const event = interactionAgentEvent(options.conversationId, source);
          active!.projection = reduceInteractionProjection(active!.projection, event);
          log.append(event);
        }
        const run = await agentRun.result();
        if (run.identity.runId !== agentRun.identity.runId) {
          throw new TypeError("Agent results must bind to the active run.");
        }
        if (terminalStatus !== run.status) {
          throw new TypeError("Agent result status must agree with its terminal event.");
        }
        if (run.output !== undefined && !isJsonValue(run.output)) {
          throw new TypeError("Agent output must be strict portable JSON.");
        }
        const providerSession = run.providerSession
          ? createProviderSessionRef(run.providerSession)
          : loaded.value.providerSession;
        const value: ConversationSessionValue = {
          conversationId: options.conversationId,
          revision: loaded.value.revision + 1,
          turns: [
            ...loaded.value.turns,
            {
              runId: run.identity.runId,
              input: submittedInput,
              status: run.status,
              ...(run.output !== undefined ? { output: structuredClone(run.output) } : {}),
              ...(run.reasonCode ? { reasonCode: run.reasonCode } : {}),
            },
          ],
          projection: active!.projection,
          ...(providerSession ? { providerSession } : {}),
        };
        const snapshot = asSnapshot(options, value);
        const saved = await options.store.save({
          conversationId: options.conversationId,
          expectedRevision: loaded.value.revision,
          reservationId: reservation!.reservationId,
          snapshot,
        });
        if (saved !== "saved") {
          throw new Error("Conversation session revision conflicted during persistence.");
        }
        current = snapshot;
        return Object.freeze({
          conversationId: options.conversationId,
          run,
          snapshot,
        });
      } finally {
        if (reservation) {
          await options.store.release(reservation);
        }
        log.close();
        active = undefined;
        busy = false;
      }
    })();

    const connection: InteractionLiveConnection = Object.freeze({
      conversationId: options.conversationId,
      runId: agentRun.identity.runId,
      events: () => log.stream(),
      result: () => resultPromise,
    });
    return Object.freeze({
      ...connection,
      continuation: createLiveContinuation(connection),
      agentRun,
    });
  };

  return Object.freeze({
    conversationId: options.conversationId,
    executionEventSink,
    emitContent,
    load,
    send,
    reconnect,
  });
};
