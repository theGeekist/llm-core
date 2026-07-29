import {
  isCanonicalUuid,
  type ConversationId,
  type JsonValue,
  type RunId,
} from "#contracts";
import {
  createLiveContinuation,
  createSnapshot,
  isLiveContinuation,
  type LiveContinuation,
} from "../../features/state/public";
import type { ExecutionEvent } from "../../features/evidence/public";
import {
  interactionAgentEvent,
  interactionExecutionEvent,
  interactionRunId,
} from "./events";
import { createInteractionProjection, reduceInteractionProjection } from "./projection";
import type {
  ConversationSessionSnapshot,
  ConversationSessionValue,
  CreateInteractionSessionOptions,
  InteractionEvent,
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

const assertLoadedSnapshot = (
  conversationId: ConversationId,
  snapshot: ConversationSessionSnapshot,
): ConversationSessionSnapshot => {
  if (
    snapshot.kind !== "snapshot" ||
    snapshot.value.conversationId !== conversationId ||
    !Number.isSafeInteger(snapshot.value.revision) ||
    snapshot.value.revision < 0 ||
    !Array.isArray(snapshot.value.turns) ||
    snapshot.value.projection.conversationId !== conversationId
  ) {
    throw new TypeError("Conversation stores must return a matching portable session snapshot.");
  }
  return snapshot;
};

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
      current = assertLoadedSnapshot(options.conversationId, loaded);
    }
    return current;
  };

  const executionEventSink = Object.freeze({
    emit: async (source: ExecutionEvent) => {
      const event = interactionExecutionEvent(options.conversationId, source);
      if (!active && startingEvents) {
        startingEvents.push(event);
        return;
      }
      if (!active || source.runId !== active.runId) {
        throw new TypeError("Execution events must bind to the active conversation run.");
      }
      active.projection = reduceInteractionProjection(active.projection, event);
      active.log.append(event);
    },
  });

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
  ): Promise<InteractionRun> => {
    if (busy) {
      throw new TypeError("A conversation session cannot start concurrent runs.");
    }
    busy = true;
    startingEvents = [];
    let loaded: ConversationSessionSnapshot;
    let agentRun: InteractionRun["agentRun"];
    let log: InteractionEventLog;
    try {
      loaded = await load();
      if (
        request.invocationContext.conversationId !== undefined &&
        request.invocationContext.conversationId !== options.conversationId
      ) {
        throw new TypeError("Invocation and session conversation identities must match.");
      }
      const capabilities = await options.runner.capabilities();
      if (loaded.value.providerSession && !capabilities.providerSessionContinuation) {
        throw new TypeError(
          "The selected runner cannot continue the stored provider session.",
        );
      }
      agentRun = await options.runner.start({
        agent: options.agent,
        invocationContext: {
          ...request.invocationContext,
          conversationId: options.conversationId,
        },
        input: request.input,
        ...(loaded.value.providerSession
          ? { providerSession: loaded.value.providerSession }
          : {}),
      });
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
      startingEvents = undefined;
      active = undefined;
      busy = false;
      throw error;
    }

    const resultPromise = (async (): Promise<InteractionRunResult> => {
      try {
        for await (const source of agentRun.events()) {
          if (source.identity.runId !== agentRun.identity.runId) {
            throw new TypeError("Agent events must bind to the active run.");
          }
          const event = interactionAgentEvent(options.conversationId, source);
          active!.projection = reduceInteractionProjection(active!.projection, event);
          log.append(event);
        }
        const run = await agentRun.result();
        if (run.identity.runId !== agentRun.identity.runId) {
          throw new TypeError("Agent results must bind to the active run.");
        }
        const value: ConversationSessionValue = {
          conversationId: options.conversationId,
          revision: loaded.value.revision + 1,
          turns: [
            ...loaded.value.turns,
            {
              runId: run.identity.runId,
              input: structuredClone(request.input),
              status: run.status,
              ...(run.output !== undefined ? { output: structuredClone(run.output) } : {}),
              ...(run.reasonCode ? { reasonCode: run.reasonCode } : {}),
            },
          ],
          projection: active!.projection,
          ...(run.providerSession ? { providerSession: run.providerSession } : {}),
        };
        const snapshot = asSnapshot(options, value);
        const saved = await options.store.save({
          conversationId: options.conversationId,
          expectedRevision: loaded.value.revision,
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
    load,
    send,
    reconnect,
  });
};
