import type { ChatKitEvents } from "@openai/chatkit";
import type { InteractionEvent, InteractionEventMeta } from "../../interaction/types";
import { bindFirst } from "../../shared/maybe";
import {
  createInteractionEventEmitterStream,
  type InteractionEventEmitter,
} from "../primitives/interaction-event-emitter";
import { isRecord } from "../../shared/guards";

export type ChatKitEventName = keyof ChatKitEvents;

export type ChatKitInteractionMapperOptions = {
  logEventName?: "chatkit.log" | "chatkit.effect";
  logModelEvents?: boolean;
};

export type ChatKitInteractionMapper = {
  mapEvent: (event: InteractionEvent) => CustomEvent[];
  reset: () => void;
};

export type ChatKitInteractionSinkOptions = {
  dispatchEvent: (event: CustomEvent) => void;
  mapper?: ChatKitInteractionMapper;
};

export type ChatKitInteractionEventStreamOptions = {
  dispatchEvent: (event: CustomEvent) => void;
  mapper?: ChatKitInteractionMapper;
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

class ChatKitInteractionMapperImpl implements ChatKitInteractionMapper {
  private options: ChatKitInteractionMapperOptions;

  constructor(options?: ChatKitInteractionMapperOptions) {
    this.options = options ?? {};
  }

  reset() {}

  mapEvent(event: InteractionEvent): CustomEvent[] {
    if (event.kind === "model") {
      return this.mapModelEvent(event);
    }
    return [toLogEvent(this.options.logEventName, event)];
  }

  private mapModelEvent(event: InteractionEvent & { kind: "model" }) {
    if (event.event.type === "start") {
      return [toResponseStart()];
    }

    if (event.event.type === "end") {
      return [toResponseEnd()];
    }

    if (event.event.type === "error") {
      return [toErrorEvent(event.event.error), toResponseEnd()];
    }

    if (shouldLogModelEvent(this.options, event)) {
      return [toLogEvent(this.options.logEventName, event)];
    }

    return [];
  }
}

export const createChatKitInteractionMapper = (
  options?: ChatKitInteractionMapperOptions,
): ChatKitInteractionMapper => new ChatKitInteractionMapperImpl(options);

class ChatKitInteractionSinkImpl {
  private dispatchEvent: (event: CustomEvent) => void;
  private mapper: ChatKitInteractionMapper;

  constructor(options: ChatKitInteractionSinkOptions) {
    this.dispatchEvent = options.dispatchEvent;
    this.mapper = options.mapper ?? createChatKitInteractionMapper();
  }

  onEvent(event: InteractionEvent) {
    const events = this.mapper.mapEvent(event);
    return dispatchEvents(this.dispatchEvent, events);
  }
}

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
    return false;
  }
}

function createChatKitEmitter(
  dispatchEvent: (event: CustomEvent) => void,
): InteractionEventEmitter<CustomEvent> {
  return { emit: bindFirst(dispatchChatKitEvent, dispatchEvent) };
}

function dispatchChatKitEvent(dispatchEvent: (event: CustomEvent) => void, event: CustomEvent) {
  try {
    dispatchEvent(event);
    return true;
  } catch {
    return false;
  }
}

export const createChatKitInteractionSink = (options: ChatKitInteractionSinkOptions) =>
  new ChatKitInteractionSinkImpl(options);

export const createChatKitInteractionEventStream = (
  options: ChatKitInteractionEventStreamOptions,
) =>
  createInteractionEventEmitterStream({
    emitter: createChatKitEmitter(options.dispatchEvent),
    mapper: options.mapper ?? createChatKitInteractionMapper(),
  });

export const toChatKitEvents = (
  input: ChatKitInteractionMapper | ChatKitInteractionMapperOptions | undefined,
  event: InteractionEvent,
): CustomEvent[] => {
  const mapper = isChatKitInteractionMapper(input) ? input : createChatKitInteractionMapper(input);
  return mapper.mapEvent(event);
};

const isChatKitInteractionMapper = (
  value: ChatKitInteractionMapper | ChatKitInteractionMapperOptions | undefined,
): value is ChatKitInteractionMapper =>
  isRecord(value) &&
  "mapEvent" in value &&
  "reset" in value &&
  typeof (value as { mapEvent?: unknown }).mapEvent === "function" &&
  typeof (value as { reset?: unknown }).reset === "function";

export const toChatKitThreadId = (
  meta: InteractionEventMeta,
  fallback?: string | null,
): string | null => meta.interactionId ?? fallback ?? null;
