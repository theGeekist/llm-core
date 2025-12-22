import type { AdapterTraceEvent, AdapterTraceSink } from "../types";

export const createBuiltinTrace = () => {
  const events: AdapterTraceEvent[] = [];
  const sink: AdapterTraceSink & { events: AdapterTraceEvent[] } = {
    events,
    emit(event) {
      events.push(event);
    },
    emitMany(many) {
      events.push(...many);
    },
  };
  return sink;
};
