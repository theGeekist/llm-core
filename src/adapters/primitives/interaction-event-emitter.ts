import type { EventStream, EventStreamEvent } from "../types";
import type { InteractionEvent } from "../../interaction/types";
import { isRecord } from "../../shared/guards";
import { bindFirst, maybeAll, maybeMap, type MaybePromise } from "../../shared/maybe";

export type InteractionEventEmitter<TEvent> = {
  emit: (event: TEvent) => MaybePromise<boolean | null>;
};

export type InteractionEventMapper<TEvent> = {
  mapEvent: (event: InteractionEvent) => TEvent[];
};

export type InteractionEventEmitterStreamOptions<TEvent> = {
  emitter: InteractionEventEmitter<TEvent>;
  mapper: InteractionEventMapper<TEvent>;
};

class InteractionEventEmitterStreamImpl<TEvent> implements EventStream {
  private emitter: InteractionEventEmitter<TEvent>;
  private mapper: InteractionEventMapper<TEvent>;

  constructor(options: InteractionEventEmitterStreamOptions<TEvent>) {
    this.emitter = options.emitter;
    this.mapper = options.mapper;
  }

  emit(event: EventStreamEvent) {
    const interactionEvent = toInteractionEvent(event);
    if (!interactionEvent) {
      return null;
    }
    const events = this.mapper.mapEvent(interactionEvent);
    return emitMappedEvents({ emitter: this.emitter, events });
  }

  emitMany(events: EventStreamEvent[]) {
    const mapped = mapInteractionEvents({ mapper: this.mapper, events });
    return emitMappedEvents({ emitter: this.emitter, events: mapped });
  }
}

export function createInteractionEventEmitterStream<TEvent>(
  options: InteractionEventEmitterStreamOptions<TEvent>,
) {
  return new InteractionEventEmitterStreamImpl(options);
}

type EmitMappedEventsInput<TEvent> = {
  emitter: InteractionEventEmitter<TEvent>;
  events: TEvent[];
};

function emitMappedEvents<TEvent>(input: EmitMappedEventsInput<TEvent>) {
  if (input.events.length === 0) {
    return null;
  }
  const results = input.events.map(bindFirst(emitEvent, input.emitter));
  return maybeMap(bindFirst(reduceEmitResults, input.events.length), maybeAll(results));
}

function emitEvent<TEvent>(emitter: InteractionEventEmitter<TEvent>, event: TEvent) {
  return emitter.emit(event);
}

function reduceEmitResults(eventCount: number, results: Array<boolean | null>) {
  if (eventCount === 0) {
    return null;
  }
  let hasTrue = false;
  let hasFalse = false;
  for (const result of results) {
    if (result === true) {
      hasTrue = true;
    } else if (result === false) {
      hasFalse = true;
    }
  }
  if (hasFalse) {
    return false;
  }
  if (hasTrue) {
    return true;
  }
  return null;
}

type MapInteractionEventsInput<TEvent> = {
  mapper: InteractionEventMapper<TEvent>;
  events: EventStreamEvent[];
};

function mapInteractionEvents<TEvent>(input: MapInteractionEventsInput<TEvent>) {
  const mapped: TEvent[] = [];
  for (const event of input.events) {
    const interactionEvent = toInteractionEvent(event);
    if (!interactionEvent) {
      continue;
    }
    appendEvents(mapped, input.mapper.mapEvent(interactionEvent));
  }
  return mapped;
}

function appendEvents<TEvent>(target: TEvent[], source: TEvent[]) {
  for (const event of source) {
    target.push(event);
  }
}

function toInteractionEvent(event: EventStreamEvent): InteractionEvent | null {
  if (!event.data || !isRecord(event.data)) {
    return null;
  }
  const candidate = event.data.event;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  return candidate as InteractionEvent;
}
