import type { AdapterTraceEvent, AdapterTraceSink } from "../types";

export const createBuiltinTrace = () => {
  const events: AdapterTraceEvent[] = [];
  const sink: AdapterTraceSink & { events: AdapterTraceEvent[] } = {
    events,
    emit(event) {
      events.push(event);
      return true;
    },
    emitMany(many) {
      events.push(...many);
      return true;
    },
  };
  return sink;
};
