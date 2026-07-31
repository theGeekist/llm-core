import { randomBytes } from "node:crypto";
import { isJsonValue, newCoreId, type ConversationId, type JsonValue } from "#contracts";
import { createSnapshot } from "../../features/state/public";
import { interactionAgentEvent } from "./events";
import {
  createInteractionProjection,
  projectInteractionEvent,
  reduceInteractionProjection,
} from "./projection";
import { registerConversationSnapshot } from "./registration";
import { AsyncEventLog } from "../async-event-log";
import type {
  Conversation,
  ConversationConfig,
  ConversationEvent,
  ConversationResult,
  ConversationRun,
  ConversationSnapshot,
  ConversationState,
  ConversationStore,
  ConversationStoreReservation,
} from "./types";

const createMemoryConversationStore = (): ConversationStore => {
  let snapshot: ConversationSnapshot | null = null;
  let reservation: ConversationStoreReservation | null = null;
  return {
    load: () => snapshot,
    reserve: (request) => {
      if (reservation || (snapshot?.value.revision ?? 0) !== request.expectedRevision) {
        return null;
      }
      reservation = Object.freeze({ ...request });
      return reservation;
    },
    save: (request) => {
      if (
        reservation?.reservationId !== request.reservationId ||
        (snapshot?.value.revision ?? 0) !== request.expectedRevision
      ) {
        return "conflict";
      }
      snapshot = request.snapshot;
      reservation = null;
      return "saved";
    },
    release: (released) => {
      if (reservation?.reservationId === released.reservationId) reservation = null;
    },
  };
};

const externalIdentity = (kind: string): string => `${kind}:${randomBytes(16).toString("hex")}`;

const conversationIdentity = (): ConversationId => {
  const timestamp = Date.now().toString(16).padStart(12, "0").slice(-12);
  const random = randomBytes(10).toString("hex");
  const variant = ((Number.parseInt(random[3]!, 16) & 0x3) | 0x8).toString(16);
  return newCoreId<ConversationId>(
    `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7${random.slice(0, 3)}-${variant}${random.slice(4, 7)}-${random.slice(7, 19)}`,
  );
};

const emptyState = (conversationId: ConversationId): ConversationState => ({
  conversationId,
  revision: 0,
  turns: Object.freeze([]),
  projection: createInteractionProjection(conversationId),
});

const releaseReservation = async (
  store: ConversationStore,
  reservation: ConversationStoreReservation | null,
): Promise<void> => {
  if (!reservation) return;
  try {
    await store.release(reservation);
  } catch {
    // Release is cleanup rather than commit authority. Durable recovery of an
    // unreachable store remains host-owned.
  }
};

export const createConversation = (config: ConversationConfig): Conversation => {
  if (
    !config.agent ||
    typeof config.agent.start !== "function" ||
    typeof config.agent.run !== "function"
  ) {
    throw new TypeError("Conversations require a ready Agent.");
  }
  const conversationId = conversationIdentity();
  const store = config.store ?? createMemoryConversationStore();
  let busy = false;

  const stream = (input: JsonValue): ConversationRun => {
    if (busy) {
      throw new TypeError("A conversation cannot start concurrent runs.");
    }
    if (!isJsonValue(input)) {
      throw new TypeError("Conversation input must be strict portable JSON.");
    }
    busy = true;
    const log = new AsyncEventLog<ConversationEvent>();
    // eslint-disable-next-line sonarjs/cognitive-complexity -- reservation, event projection and persistence form one atomic run lifecycle
    const result = (async (): Promise<ConversationResult> => {
      let reservation: ConversationStoreReservation | null = null;
      try {
        const stored = await store.load({ conversationId });
        const loaded = stored
          ? registerConversationSnapshot(stored, conversationId)
          : {
              kind: "snapshot",
              snapshotId: externalIdentity("conversation-snapshot"),
              createdAt: new Date().toISOString(),
              value: emptyState(conversationId),
            };
        const reservationId = externalIdentity("conversation-reservation");
        reservation = await store.reserve({
          conversationId,
          expectedRevision: loaded.value.revision,
          reservationId,
        });
        if (!reservation) {
          throw new Error("Conversation could not reserve its current revision.");
        }
        if (
          reservation.conversationId !== conversationId ||
          reservation.expectedRevision !== loaded.value.revision ||
          reservation.reservationId !== reservationId
        ) {
          throw new TypeError("Conversation store returned a mismatched reservation.");
        }

        const agentRun = config.agent.start(structuredClone(input));
        let projection = loaded.value.projection;
        for await (const source of agentRun.events()) {
          if (source.identity.runId !== agentRun.identity.runId) {
            throw new TypeError("Agent events must bind to the active conversation run.");
          }
          const event = interactionAgentEvent(conversationId, source);
          projection = reduceInteractionProjection(projection, event);
          const projected = projectInteractionEvent(event);
          if (projected) log.append(projected);
        }
        const agentResult = await agentRun.result();
        if (agentResult.identity.runId !== agentRun.identity.runId) {
          throw new TypeError("Agent results must bind to the active conversation run.");
        }
        if (
          projection.runId !== agentResult.identity.runId ||
          projection.status !== agentResult.status
        ) {
          throw new TypeError("Agent results must agree with their terminal conversation event.");
        }

        const state: ConversationState = {
          conversationId,
          revision: loaded.value.revision + 1,
          turns: [
            ...loaded.value.turns,
            {
              runId: agentResult.identity.runId,
              input: structuredClone(input),
              status: agentResult.status,
              ...(agentResult.output === undefined
                ? {}
                : { output: structuredClone(agentResult.output) }),
              ...(agentResult.reasonCode === undefined
                ? {}
                : { reasonCode: agentResult.reasonCode }),
            },
          ],
          projection: {
            ...projection,
            eventIds: projection.events.map((event) => event.eventId),
            eventFingerprints: {},
            lastSequences: {},
          },
          ...(agentResult.providerSession
            ? { providerSession: agentResult.providerSession }
            : loaded.value.providerSession
              ? { providerSession: loaded.value.providerSession }
              : {}),
        };
        const snapshot = createSnapshot({
          snapshotId: externalIdentity("conversation-snapshot"),
          createdAt: new Date().toISOString(),
          value: state as unknown as JsonValue,
        }) as unknown as ConversationSnapshot;
        const saved = await store.save({
          conversationId,
          expectedRevision: loaded.value.revision,
          reservationId,
          snapshot,
        });
        if (saved !== "saved") {
          throw new Error("Conversation revision conflicted during persistence.");
        }
        return Object.freeze({
          conversationId,
          status: agentResult.status,
          ...(agentResult.output === undefined
            ? {}
            : { output: structuredClone(agentResult.output) }),
          ...(agentResult.reasonCode === undefined ? {} : { reasonCode: agentResult.reasonCode }),
        });
      } catch (error) {
        log.close(error);
        throw error;
      } finally {
        log.close();
        busy = false;
        await releaseReservation(store, reservation);
      }
    })();
    void result.catch(() => undefined);

    const events = log.stream();
    return Object.freeze({
      [Symbol.asyncIterator]: () => events[Symbol.asyncIterator](),
      result: () => result,
    });
  };

  return Object.freeze({
    conversationId,
    send: async (input: JsonValue) => stream(input).result(),
    stream,
  });
};
