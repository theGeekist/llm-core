import type { AdapterTraceEvent, AdapterTraceSink, EventStream } from "../types";
import { bindFirst, mapMaybe, maybeAll } from "../../maybe";

const toUndefined = () => undefined;

const emitTraceEvent = (sink: AdapterTraceSink, event: AdapterTraceEvent) =>
  mapMaybe(sink.emit(event), toUndefined);

const emitTraceEvents = (sink: AdapterTraceSink, events: AdapterTraceEvent[]) => {
  if (sink.emitMany) {
    return mapMaybe(sink.emitMany(events), toUndefined);
  }
  const results: Array<ReturnType<typeof emitTraceEvent>> = [];
  for (const event of events) {
    results.push(emitTraceEvent(sink, event));
  }
  return mapMaybe(maybeAll(results), toUndefined);
};

export const createEventStreamFromTraceSink = (sink: AdapterTraceSink): EventStream => ({
  emit: bindFirst(emitTraceEvent, sink),
  emitMany: bindFirst(emitTraceEvents, sink),
});
