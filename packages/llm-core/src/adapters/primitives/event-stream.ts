import type { AdapterTraceEvent, EventStream } from "../types";
import { bindFirst } from "#shared/fp";
import { maybeAll, maybeMap, maybeReduce } from "#shared/maybe";
import { combineTriState, combineTriStates, normalizeTriState } from "#shared/tri-state";

const emitTraceEvent = (sink: EventStream, event: AdapterTraceEvent) =>
  maybeMap(normalizeTriState, sink.emit(event));

const emitNextTraceEvent = (
  sink: EventStream,
  previous: boolean | null,
  event: AdapterTraceEvent,
) => maybeMap(bindFirst(combineTriState, previous), emitTraceEvent(sink, event));

const emitTraceEvents = (sink: EventStream, events: AdapterTraceEvent[]) => {
  if (sink.emitMany) {
    return maybeMap(normalizeTriState, sink.emitMany(events));
  }
  if (events.length === 0) {
    return null;
  }
  return maybeReduce(bindFirst(emitNextTraceEvent, sink), null, events);
};

export const createEventStreamFromTraceSink = (sink: EventStream): EventStream => ({
  emit: bindFirst(emitTraceEvent, sink),
  emitMany: bindFirst(emitTraceEvents, sink),
});

const emitTraceEventForStream = (event: AdapterTraceEvent, sink: EventStream) =>
  emitTraceEvent(sink, event);

const emitTraceEventsForStream = (events: AdapterTraceEvent[], sink: EventStream) =>
  emitTraceEvents(sink, events);

const emitFanoutEvent = (streams: EventStream[], event: AdapterTraceEvent) => {
  if (streams.length === 0) {
    return null;
  }
  const results = streams.map(bindFirst(emitTraceEventForStream, event));
  return maybeMap(combineTriStates, maybeAll(results));
};

const emitFanoutEvents = (streams: EventStream[], events: AdapterTraceEvent[]) => {
  if (streams.length === 0) {
    return null;
  }
  const results = streams.map(bindFirst(emitTraceEventsForStream, events));
  return maybeMap(combineTriStates, maybeAll(results));
};

export const createEventStreamFanout = (streams: EventStream[]): EventStream => ({
  emit: bindFirst(emitFanoutEvent, streams),
  emitMany: bindFirst(emitFanoutEvents, streams),
});
