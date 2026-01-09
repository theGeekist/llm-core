import type { ChatAdapter, ChatAdapterExtras, StreamingAdapterObserver } from "@nlux/core";
import type { EventStream, EventStreamEvent } from "../types";
import type { InteractionHandle, InteractionHandleInput } from "../../interaction/handle";
import type { InteractionEvent, InteractionState } from "../../interaction/types";
import type { Message, MessageContent } from "../types/messages";
import { maybeMap, toNull } from "../../shared/maybe";
import { isRecord } from "../../shared/guards";
import { toMessageContent } from "../message-content";

export type NluxChatAdapterOptions = {
  handle: InteractionHandle;
  mapChunk?: (event: InteractionEvent) => string | null;
  mapResult?: (state: InteractionState) => string;
  interactionId?: (extras: ChatAdapterExtras<string>) => string;
  correlationId?: (extras: ChatAdapterExtras<string>) => string;
};

class NluxChatAdapterImpl implements ChatAdapter<string> {
  private options: NluxChatAdapterOptions;

  constructor(options: NluxChatAdapterOptions) {
    this.options = options;
  }

  streamText(
    message: string,
    observer: StreamingAdapterObserver<string>,
    extras: ChatAdapterExtras<string>,
  ) {
    const input: StreamInput = { message, observer, extras };
    const eventStream = new NluxInteractionEventStream(this.options, observer);
    const interactionInput = buildInteractionInput(this.options, input);
    const result = this.options.handle.run(interactionInput, { eventStream });
    return maybeMap(toNull, result);
  }

  async batchText(message: string, extras: ChatAdapterExtras<string>): Promise<string> {
    const input: BatchInput = { message, extras };
    const interactionInput = buildInteractionInput(this.options, input);
    const result = await this.options.handle.run(interactionInput);
    return readResultText(this.options, result.state);
  }
}

export function createNluxChatAdapter(options: NluxChatAdapterOptions): ChatAdapter<string> {
  return new NluxChatAdapterImpl(options);
}

type StreamInput = {
  message: string;
  observer: StreamingAdapterObserver<string>;
  extras: ChatAdapterExtras<string>;
};

type BatchInput = {
  message: string;
  extras: ChatAdapterExtras<string>;
};

type NluxChatItem = NonNullable<ChatAdapterExtras<string>["conversationHistory"]>[number];

class NluxInteractionEventStream implements EventStream {
  private options: NluxChatAdapterOptions;
  private observer: StreamingAdapterObserver<string>;

  constructor(options: NluxChatAdapterOptions, observer: StreamingAdapterObserver<string>) {
    this.options = options;
    this.observer = observer;
  }

  emit(event: EventStreamEvent) {
    const interactionEvent = toInteractionEvent(event);
    if (!interactionEvent) {
      return null;
    }
    return handleInteractionEvent(this.options, this.observer, interactionEvent);
  }

  emitMany(events: EventStreamEvent[]) {
    let hasEvent = false;
    let hasFailure = false;
    for (const event of events) {
      const interactionEvent = toInteractionEvent(event);
      if (!interactionEvent) {
        continue;
      }
      const result = handleInteractionEvent(this.options, this.observer, interactionEvent);
      if (result === false) {
        hasFailure = true;
      } else if (result === true) {
        hasEvent = true;
      }
    }
    if (hasFailure) {
      return false;
    }
    if (hasEvent) {
      return true;
    }
    return null;
  }
}

function handleInteractionEvent(
  options: NluxChatAdapterOptions,
  observer: StreamingAdapterObserver<string>,
  event: InteractionEvent,
) {
  if (event.kind !== "model") {
    return null;
  }
  return handleModelEvent(options, observer, event);
}

function handleModelEvent(
  options: NluxChatAdapterOptions,
  observer: StreamingAdapterObserver<string>,
  event: Extract<InteractionEvent, { kind: "model" }>,
) {
  const chunk = readChunk(options, event);
  if (chunk) {
    return emitChunk(observer, chunk);
  }
  if (event.event.type === "end") {
    return completeObserver(observer);
  }
  if (event.event.type === "error") {
    return errorObserver(observer, event.event.error);
  }
  return null;
}

function readChunk(options: NluxChatAdapterOptions, event: InteractionEvent) {
  if (options.mapChunk) {
    return options.mapChunk(event);
  }
  if (event.kind === "model" && event.event.type === "delta") {
    return event.event.text ?? null;
  }
  return null;
}

function emitChunk(observer: StreamingAdapterObserver<string>, chunk: string) {
  try {
    observer.next(chunk);
    return true;
  } catch {
    return false;
  }
}

function completeObserver(observer: StreamingAdapterObserver<string>) {
  try {
    observer.complete();
    return true;
  } catch {
    return false;
  }
}

function errorObserver(observer: StreamingAdapterObserver<string>, error: unknown) {
  try {
    observer.error(toError(error));
    return true;
  } catch {
    return false;
  }
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  return new Error("Unknown error");
}

function buildInteractionInput(
  options: NluxChatAdapterOptions,
  input: StreamInput | BatchInput,
): InteractionHandleInput {
  const state = toInteractionState(input.extras);
  return {
    message: { role: "user", content: input.message },
    state,
    interactionId: resolveInteractionId(options, input.extras),
    correlationId: resolveCorrelationId(options, input.extras),
  };
}

function toInteractionState(extras: ChatAdapterExtras<string>): InteractionState {
  const history = extras.conversationHistory ?? [];
  const messages = history.map(toMessageFromChatItem);
  return {
    messages,
    diagnostics: [],
    trace: [],
  };
}

function toMessageFromChatItem(item: NluxChatItem): Message {
  if (item.role === "assistant") {
    return {
      role: "assistant",
      content: toMessageContent(item.message),
    };
  }
  if (item.role === "system") {
    return { role: "system", content: item.message };
  }
  return { role: "user", content: item.message };
}

function resolveInteractionId(options: NluxChatAdapterOptions, extras: ChatAdapterExtras<string>) {
  return options.interactionId ? options.interactionId(extras) : undefined;
}

function resolveCorrelationId(options: NluxChatAdapterOptions, extras: ChatAdapterExtras<string>) {
  if (options.correlationId) {
    return options.correlationId(extras);
  }
  return extras.contextId;
}

function readResultText(options: NluxChatAdapterOptions, state: InteractionState) {
  if (options.mapResult) {
    return options.mapResult(state);
  }
  return readLatestAssistantText(state);
}

function readLatestAssistantText(state: InteractionState) {
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    const message = state.messages[i];
    if (message && message.role === "assistant") {
      return readMessageText(message.content);
    }
  }
  return "";
}

function readMessageText(content: MessageContent) {
  if (typeof content === "string") {
    return content;
  }
  return content.text;
}

function toInteractionEvent(event: EventStreamEvent): InteractionEvent | null {
  if (!event.data || !isRecord(event.data)) {
    return null;
  }
  const candidate = event.data.event;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  return candidate as InteractionEvent;
}
