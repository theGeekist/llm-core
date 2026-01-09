import type { AdapterTraceEvent, EventStream } from "../types";
import { bindFirst } from "../../shared/fp";
import { maybeAll, maybeMap } from "../../shared/maybe";

const toBoolean = (value: unknown): boolean | null => (value === null ? null : value !== false);
const isFailure = (value: boolean | null) => value === false;
const isUnknown = (value: boolean | null) => value === null;
const allSuccessful = (values: Array<boolean | null>) => {
  if (values.some(isFailure)) {
    return false;
  }
  if (values.some(isUnknown)) {
    return null;
  }
  return true;
};

const emitTraceEvent = (sink: EventStream, event: AdapterTraceEvent) =>
  maybeMap(toBoolean, sink.emit(event));

const emitTraceEvents = (sink: EventStream, events: AdapterTraceEvent[]) => {
  if (sink.emitMany) {
    return maybeMap(toBoolean, sink.emitMany(events));
  }
  const results: Array<ReturnType<typeof emitTraceEvent>> = [];
  for (const event of events) {
    results.push(emitTraceEvent(sink, event));
  }
  return maybeMap(allSuccessful, maybeAll(results));
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
  return maybeMap(allSuccessful, maybeAll(results));
};

const emitFanoutEvents = (streams: EventStream[], events: AdapterTraceEvent[]) => {
  if (streams.length === 0) {
    return null;
  }
  const results = streams.map(bindFirst(emitTraceEventsForStream, events));
  return maybeMap(allSuccessful, maybeAll(results));
};

export const createEventStreamFanout = (streams: EventStream[]): EventStream => ({
  emit: bindFirst(emitFanoutEvent, streams),
  emitMany: bindFirst(emitFanoutEvents, streams),
});
