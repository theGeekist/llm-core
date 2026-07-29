import type { AdapterTraceEvent, EventStream } from "../types";
import { bindFirst } from "#shared/fp";
import { maybeAll, maybeMap } from "#shared/maybe";
import { combineTriStates, maybeReduceTriState, normalizeTriState } from "#shared/tri-state";

const emitTraceEvent = (sink: EventStream, event: AdapterTraceEvent) =>
  maybeMap(normalizeTriState, sink.emit(event));

const emitTraceEvents = (sink: EventStream, events: AdapterTraceEvent[]) => {
  if (sink.emitMany) {
    return maybeMap(normalizeTriState, sink.emitMany(events));
  }
  return maybeReduceTriState(bindFirst(emitTraceEvent, sink), events);
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
