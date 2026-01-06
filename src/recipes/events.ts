import { maybeMap, maybeAll } from "../maybe";
import type { AdapterTraceEvent, EventStream } from "../adapters/types";
import type { PipelineContext, PipelineState } from "../workflow/types";

const EVENTS_STATE_KEY = "recipe.events";

const isEventArray = (value: unknown): value is AdapterTraceEvent[] => Array.isArray(value);

const readEventStream = (context: PipelineContext): EventStream | null | undefined =>
  context.adapters?.eventStream;

const ensureEventList = (state: PipelineState): AdapterTraceEvent[] => {
  const current = state[EVENTS_STATE_KEY];
  if (isEventArray(current)) {
    return current;
  }
  const next: AdapterTraceEvent[] = [];
  state[EVENTS_STATE_KEY] = next;
  return next;
};

const appendEventList = (list: AdapterTraceEvent[], event: AdapterTraceEvent) => {
  list.push(event);
  return list;
};

const appendEvent = (state: PipelineState, event: AdapterTraceEvent) =>
  appendEventList(ensureEventList(state), event);

const appendEvents = (state: PipelineState, events: AdapterTraceEvent[]) => {
  const list = ensureEventList(state);
  for (const event of events) {
    list.push(event);
  }
  return list;
};

const isFailure = (value: boolean | null) => value === false;
const isUnknown = (value: boolean | null) => value === null;

const combineResults = (values: Array<boolean | null>) => {
  if (values.some(isFailure)) {
    return false;
  }
  if (values.some(isUnknown)) {
    return null;
  }
  return true;
};

const emitEventWithStream = (stream: EventStream, event: AdapterTraceEvent) => stream.emit(event);

const emitEventsSequentially = (stream: EventStream, events: AdapterTraceEvent[]) => {
  const results: Array<ReturnType<EventStream["emit"]>> = [];
  for (const event of events) {
    results.push(emitEventWithStream(stream, event));
  }
  return maybeMap(combineResults, maybeAll(results));
};

const emitEventsWithStream = (stream: EventStream, events: AdapterTraceEvent[]) => {
  if (stream.emitMany) {
    return stream.emitMany(events);
  }
  return emitEventsSequentially(stream, events);
};

export const readRecipeEvents = (state: PipelineState) => {
  const current = state[EVENTS_STATE_KEY];
  return isEventArray(current) ? current : [];
};

export const emitRecipeEvent = (
  context: PipelineContext,
  state: PipelineState,
  event: AdapterTraceEvent,
) => {
  appendEvent(state, event);
  const stream = readEventStream(context);
  return stream ? emitEventWithStream(stream, event) : null;
};

export const emitRecipeEvents = (
  context: PipelineContext,
  state: PipelineState,
  events: AdapterTraceEvent[],
) => {
  appendEvents(state, events);
  const stream = readEventStream(context);
  return stream ? emitEventsWithStream(stream, events) : null;
};
