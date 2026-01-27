import type {
  InteractionContext,
  InteractionEvent,
  InteractionEventMeta,
  InteractionInput,
  InteractionState,
} from "./types";
import { emitInteractionEvent, emitInteractionEvents } from "./transport";

export const createMeta = (
  state: InteractionState,
  input: InteractionInput,
  sourceId: string,
): InteractionEventMeta => ({
  sequence: (state.lastSequence ?? 0) + 1,
  timestamp: Date.now(),
  sourceId,
  correlationId: input.correlationId,
  interactionId: input.interactionId,
});

export const createMetaWithSequence = (
  sequence: number,
  input: InteractionInput,
  sourceId: string,
): InteractionEventMeta => ({
  sequence,
  timestamp: Date.now(),
  sourceId,
  correlationId: input.correlationId,
  interactionId: input.interactionId,
});

export const emitInteraction = (context: InteractionContext, event: InteractionEvent) => {
  if (!context.eventStream) {
    return null;
  }
  return emitInteractionEvent(context.eventStream, event);
};

export const emitInteractionEventsForContext = (
  context: InteractionContext,
  events: InteractionEvent[],
) => {
  if (!context.eventStream) {
    return null;
  }
  return emitInteractionEvents(context.eventStream, events);
};
