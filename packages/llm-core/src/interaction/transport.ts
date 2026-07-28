import type { EventStream, EventStreamEvent } from "#adapters/types";
import { maybeMap, maybeReduce, type MaybePromise } from "#shared/maybe";
import { bindFirst } from "#shared/fp";
import { combineTriState } from "#shared/tri-state";
import type { InteractionEvent, InteractionState } from "./types";

export type InteractionSink = {
  onState?: (state: InteractionState) => void;
  onEvent?: (event: InteractionEvent) => void;
};

export const toEventStreamEvent = (event: InteractionEvent): EventStreamEvent => ({
  name: `interaction.${event.kind}`,
  data: {
    event,
  },
});

export const emitInteractionEvent = (
  stream: EventStream,
  event: InteractionEvent,
): MaybePromise<boolean | null> => stream.emit(toEventStreamEvent(event));

const emitNextInteractionEvent = (
  input: { stream: EventStream; event: InteractionEvent },
  previous: boolean | null,
) =>
  maybeMap(bindFirst(combineTriState, previous), emitInteractionEvent(input.stream, input.event));

export const emitInteractionEvents = (
  stream: EventStream,
  events: InteractionEvent[],
): MaybePromise<boolean | null> => {
  if (stream.emitMany) {
    const mapped: EventStreamEvent[] = [];
    for (const event of events) {
      mapped.push(toEventStreamEvent(event));
    }
    return stream.emitMany(mapped);
  }
  if (events.length === 0) {
    return null;
  }
  const emit = (previous: boolean | null, event: InteractionEvent) =>
    emitNextInteractionEvent({ stream, event }, previous);
  return maybeReduce(emit, null, events);
};
