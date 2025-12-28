import type { AdapterTraceEvent, AdapterTraceSink, EventStream } from "../types";
import { maybeAll } from "@wpkernel/pipeline/core/async-utils";
import { bindFirst, maybeMap } from "../../maybe";

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

const emitTraceEvent = (sink: AdapterTraceSink, event: AdapterTraceEvent) =>
  maybeMap(toBoolean, sink.emit(event));

const emitTraceEvents = (sink: AdapterTraceSink, events: AdapterTraceEvent[]) => {
  if (sink.emitMany) {
    return maybeMap(toBoolean, sink.emitMany(events));
  }
  const results: Array<ReturnType<typeof emitTraceEvent>> = [];
  for (const event of events) {
    results.push(emitTraceEvent(sink, event));
  }
  return maybeMap(allSuccessful, maybeAll(results) as Array<boolean | null>);
};

export const createEventStreamFromTraceSink = (sink: AdapterTraceSink): EventStream => ({
  emit: bindFirst(emitTraceEvent, sink),
  emitMany: bindFirst(emitTraceEvents, sink),
});
