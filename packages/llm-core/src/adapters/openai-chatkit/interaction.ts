import type { ChatKitEvents } from "@openai/chatkit";
import type { InteractionEvent, InteractionEventMeta } from "../../interaction/types";
import { bindFirst } from "#shared/fp";
import {
  createInteractionEventDeliverySink,
  createInteractionEventDeliveryStream,
} from "../primitives/interaction-event-emitter";

export type ChatKitEventName = keyof ChatKitEvents;

export type ChatKitInteractionMapperOptions = {
  logEventName?: "chatkit.log" | "chatkit.effect";
  logModelEvents?: boolean;
};

export type ChatKitEventMapper = (event: InteractionEvent) => CustomEvent[];

export type ChatKitInteractionSinkOptions = {
  dispatchEvent: (event: CustomEvent) => void;
  mapper?: ChatKitEventMapper;
};

export type ChatKitInteractionEventStreamOptions = {
  dispatchEvent: (event: CustomEvent) => void;
  mapper?: ChatKitEventMapper;
};

const DEFAULT_LOG_EVENT: ChatKitInteractionMapperOptions["logEventName"] = "chatkit.log";

const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  return new Error("Unknown error");
};

const createChatKitEvent = <K extends ChatKitEventName>(
  type: K,
  detail: ChatKitEvents[K]["detail"],
) => new CustomEvent(type, { detail });

const toLogDetail = (event: InteractionEvent) => ({
  name: `interaction.${event.kind}`,
  data: { event },
});

const toLogEvent = (
  eventName: ChatKitInteractionMapperOptions["logEventName"],
  event: InteractionEvent,
) => createChatKitEvent(eventName ?? DEFAULT_LOG_EVENT, toLogDetail(event));

const toResponseStart = () => createChatKitEvent("chatkit.response.start", undefined);

const toResponseEnd = () => createChatKitEvent("chatkit.response.end", undefined);

const toErrorEvent = (error: unknown) =>
  createChatKitEvent("chatkit.error", { error: toError(error) });

const shouldLogModelEvent = (options: ChatKitInteractionMapperOptions, event: InteractionEvent) =>
  Boolean(options.logModelEvents) && event.kind === "model";

const mapModelEvent = (
  options: ChatKitInteractionMapperOptions,
  event: InteractionEvent & { kind: "model" },
) => {
  if (event.event.type === "start") {
    return [toResponseStart()];
  }

  if (event.event.type === "end") {
    return [toResponseEnd()];
  }

  if (event.event.type === "error") {
    return [toErrorEvent(event.event.error), toResponseEnd()];
  }

  if (shouldLogModelEvent(options, event)) {
    return [toLogEvent(options.logEventName, event)];
  }

  return [];
};

const mapChatKitEvent = (
  options: ChatKitInteractionMapperOptions,
  event: InteractionEvent,
): CustomEvent[] =>
  event.kind === "model"
    ? mapModelEvent(options, event)
    : [toLogEvent(options.logEventName, event)];

function dispatchEvents(dispatchEvent: (event: CustomEvent) => void, events: CustomEvent[]) {
  if (events.length === 0) {
    return null;
  }
  try {
    for (const event of events) {
      dispatchEvent(event);
    }
    return true;
  } catch {
    // Silent failure is intentional for resilience, but debug logging could be added here.
    return false;
  }
}

export const createChatKitInteractionSink = (options: ChatKitInteractionSinkOptions) =>
  createInteractionEventDeliverySink({
    mapper: { mapEvent: options.mapper ?? createChatKitEventMapper() },
    deliver: bindFirst(dispatchEvents, options.dispatchEvent),
  });

export const createChatKitInteractionEventStream = (
  options: ChatKitInteractionEventStreamOptions,
) =>
  createInteractionEventDeliveryStream({
    mapper: { mapEvent: options.mapper ?? createChatKitEventMapper() },
    deliver: bindFirst(dispatchEvents, options.dispatchEvent),
  });

export const createChatKitEventMapper = (
  options?: ChatKitInteractionMapperOptions,
): ChatKitEventMapper => bindFirst(mapChatKitEvent, options ?? {});

export const toChatKitThreadId = (
  meta: InteractionEventMeta,
  fallback?: string | null,
): string | null => meta.interactionId ?? fallback ?? null;
