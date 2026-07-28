import type { EventStream, EventStreamEvent } from "../types";
import type { InteractionEvent } from "../../interaction/types";
import { isRecord } from "#shared/guards";
import { bindFirst } from "#shared/fp";
import { maybeMap, maybeReduce, type MaybePromise } from "#shared/maybe";
import { combineTriState } from "#shared/tri-state";

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

export type InteractionEventDelivery<TEvent> = (events: TEvent[]) => MaybePromise<boolean | null>;

export type InteractionEventDeliveryOptions<TEvent> = {
  deliver: InteractionEventDelivery<TEvent>;
  mapper: InteractionEventMapper<TEvent>;
};

const deliverInteractionEvent = <TEvent>(
  options: InteractionEventDeliveryOptions<TEvent>,
  event: InteractionEvent,
) => options.deliver(options.mapper.mapEvent(event));

const deliverEventStreamEvent = <TEvent>(
  options: InteractionEventDeliveryOptions<TEvent>,
  event: EventStreamEvent,
) => {
  const interactionEvent = toInteractionEvent(event);
  return interactionEvent ? deliverInteractionEvent(options, interactionEvent) : null;
};

const deliverEventStreamEvents = <TEvent>(
  options: InteractionEventDeliveryOptions<TEvent>,
  events: EventStreamEvent[],
) => options.deliver(mapInteractionEvents({ mapper: options.mapper, events }));

export function createInteractionEventDeliverySink<TEvent>(
  options: InteractionEventDeliveryOptions<TEvent>,
) {
  return { onEvent: bindFirst(deliverInteractionEvent, options) };
}

export function createInteractionEventDeliveryStream<TEvent>(
  options: InteractionEventDeliveryOptions<TEvent>,
) {
  return {
    emit: bindFirst(deliverEventStreamEvent, options),
    emitMany: bindFirst(deliverEventStreamEvents, options),
  } satisfies EventStream;
}

export function createInteractionEventEmitterStream<TEvent>(
  options: InteractionEventEmitterStreamOptions<TEvent>,
) {
  return createInteractionEventDeliveryStream({
    mapper: options.mapper,
    deliver: bindFirst(emitMappedEvents, options.emitter),
  });
}

function emitMappedEvents<TEvent>(emitter: InteractionEventEmitter<TEvent>, events: TEvent[]) {
  if (events.length === 0) {
    return null;
  }
  return maybeReduce(bindFirst(emitNextEvent, emitter), null, events);
}

function emitEvent<TEvent>(emitter: InteractionEventEmitter<TEvent>, event: TEvent) {
  return emitter.emit(event);
}

function emitNextEvent<TEvent>(
  emitter: InteractionEventEmitter<TEvent>,
  previous: boolean | null,
  event: TEvent,
) {
  return maybeMap(bindFirst(combineTriState, previous), emitEvent(emitter, event));
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

const isOneOf = (value: unknown, values: readonly string[]) =>
  typeof value === "string" && values.includes(value);

const hasOwn = (value: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

function isValidStreamEvent(value: unknown) {
  if (!isRecord(value) || !isOneOf(value.type, ["start", "delta", "usage", "end", "error"])) {
    return false;
  }
  if (value.type === "usage") {
    return isRecord(value.usage);
  }
  return value.type !== "error" || hasOwn(value, "error");
}

function isValidTraceEvent(value: unknown) {
  return isRecord(value) && typeof value.kind === "string" && typeof value.at === "string";
}

function isValidDiagnosticEntry(value: unknown) {
  return (
    isRecord(value) &&
    isOneOf(value.level, ["warn", "error"]) &&
    isOneOf(value.kind, [
      "pipeline",
      "workflow",
      "requirement",
      "contract",
      "resume",
      "adapter",
      "recipe",
    ]) &&
    typeof value.message === "string"
  );
}

function isValidInteractionItemEvent(value: unknown) {
  if (
    !isRecord(value) ||
    !isOneOf(value.type, ["started", "updated", "completed"]) ||
    !isRecord(value.item) ||
    typeof value.item.id !== "string" ||
    !isRecord(value.item.details)
  ) {
    return false;
  }
  return isOneOf(value.item.details.type, [
    "agent_message",
    "reasoning",
    "command_execution",
    "file_change",
    "mcp_tool_call",
    "todo_list",
    "error",
  ]);
}

function isValidInteractionSubagentEvent(value: unknown) {
  return (
    isRecord(value) &&
    isOneOf(value.type, ["selected", "started", "completed", "failed"]) &&
    isRecord(value.agent) &&
    typeof value.agent.id === "string" &&
    typeof value.agent.name === "string"
  );
}

function isValidEventStreamEvent(value: unknown) {
  return isRecord(value) && typeof value.name === "string";
}

function hasValidInteractionPayload(candidate: Record<string, unknown>) {
  switch (candidate.kind) {
    case "model":
    case "query":
      return isValidStreamEvent(candidate.event);
    case "trace":
      return isValidTraceEvent(candidate.event);
    case "diagnostic":
      return isValidDiagnosticEntry(candidate.entry);
    case "item":
      return isValidInteractionItemEvent(candidate.event);
    case "subagent":
      return isValidInteractionSubagentEvent(candidate.event);
    case "event-stream":
      return isValidEventStreamEvent(candidate.event);
    default:
      return false;
  }
}

function isValidInteractionEvent(candidate: unknown): candidate is InteractionEvent {
  if (!isRecord(candidate) || !isRecord(candidate.meta)) {
    return false;
  }
  return (
    Number.isFinite(candidate.meta.sequence) &&
    Number.isFinite(candidate.meta.timestamp) &&
    typeof candidate.meta.sourceId === "string" &&
    hasValidInteractionPayload(candidate)
  );
}

function toInteractionEvent(event: EventStreamEvent): InteractionEvent | null {
  if (!event.data || !isRecord(event.data)) {
    return null;
  }
  const candidate = event.data.event;
  if (!isValidInteractionEvent(candidate)) {
    return null;
  }
  return candidate;
}
