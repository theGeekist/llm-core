import type { EventStream, EventStreamEvent } from "#adapters/types";
import type { MaybePromise } from "#shared/maybe";
import { bindFirst } from "#shared/fp";
import { maybeReduceTriState } from "#shared/tri-state";
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
  return maybeReduceTriState(bindFirst(emitInteractionEvent, stream), events);
};
