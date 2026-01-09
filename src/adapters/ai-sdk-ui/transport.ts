import type {
  ChatRequestOptions,
  ChatTransport,
  ModelMessage,
  UIMessage,
  UIMessageChunk,
  UIMessageStreamWriter,
} from "ai";
import { convertToModelMessages, createUIMessageStream } from "ai";
import type { InteractionHandle, InteractionHandleInput } from "../../interaction/handle";
import type { InteractionHandleOverrides, InteractionHandleResult } from "../../interaction/handle";
import type { InteractionState } from "../../interaction/types";
import type { Message } from "../types/messages";
import { bindFirst, toNull } from "../../shared/fp";
import { maybeChain, maybeMap, type MaybePromise } from "../../shared/maybe";
import { fromAiSdkMessage } from "../ai-sdk/messages";
import {
  createAiSdkInteractionEventStream,
  createAiSdkInteractionMapper,
  type AiSdkInteractionMapper,
  type AiSdkInteractionMapperOptions,
} from "./interaction";

export type AiSdkChatTransportOptions = {
  handle: Pick<InteractionHandle, "run">;
  mapper?: AiSdkInteractionMapper | AiSdkInteractionMapperOptions;
  onError?: (error: unknown) => string;
  mapMessages?: (messages: UIMessage[]) => MaybePromise<Message[]>;
  interactionId?: (chatId: string) => string;
  correlationId?: (chatId: string) => string;
  captureEvents?: boolean;
};

type ChatSendOptions<UI_MESSAGE extends UIMessage> = {
  trigger: "submit-message" | "regenerate-message";
  chatId: string;
  messageId: string | undefined;
  messages: UI_MESSAGE[];
  abortSignal: AbortSignal | undefined;
} & ChatRequestOptions;

type ExecuteConfig<UI_MESSAGE extends UIMessage> = {
  transport: AiSdkChatTransportImpl<UI_MESSAGE>;
  options: ChatSendOptions<UI_MESSAGE>;
};

type RunConfig = {
  transport: AiSdkChatTransportImpl<UIMessage>;
  overrides: InteractionHandleOverrides;
};

type BuildInputConfig = {
  options: ChatSendOptions<UIMessage>;
  transport: AiSdkChatTransportImpl<UIMessage>;
};

type SplitMessagesResult = {
  history: Message[];
  input?: Message;
};

class AiSdkChatTransportImpl<UI_MESSAGE extends UIMessage> implements ChatTransport<UI_MESSAGE> {
  readonly options: AiSdkChatTransportOptions;

  constructor(options: AiSdkChatTransportOptions) {
    this.options = options;
  }

  async sendMessages(
    options: ChatSendOptions<UI_MESSAGE>,
  ): Promise<ReadableStream<UIMessageChunk>> {
    const config: ExecuteConfig<UI_MESSAGE> = { transport: this, options };
    const execute = toUiMessageExecute(bindFirst(executeInteractionStream, config));
    const stream = createUIMessageStream<UI_MESSAGE>({
      execute: execute,
      onError: this.options.onError,
      originalMessages: options.messages,
    });
    return toUiMessageChunkStream(stream);
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}

export function createAiSdkChatTransport(options: AiSdkChatTransportOptions) {
  return new AiSdkChatTransportImpl(options);
}

function executeInteractionStream(
  config: ExecuteConfig<UIMessage>,
  input: { writer: UIMessageStreamWriter },
) {
  const mapper = readMapper(config.transport.options);
  const eventStream = createAiSdkInteractionEventStream({ writer: input.writer, mapper });
  const overrides: InteractionHandleOverrides = {
    eventStream,
    captureEvents: config.transport.options.captureEvents,
  };
  const runConfig: RunConfig = { transport: config.transport, overrides };
  const buildConfig: BuildInputConfig = { options: config.options, transport: config.transport };
  const mappedMessages = readMapMessages(config.transport.options, config.options.messages);
  const interactionInput = maybeMap(bindFirst(buildInteractionInput, buildConfig), mappedMessages);
  const runResult = maybeChain(bindFirst(runInteractionHandle, runConfig), interactionInput);
  return maybeMap(toNull, runResult);
}

function readMapper(options: AiSdkChatTransportOptions) {
  const mapper = options.mapper;
  if (mapper && isAiSdkInteractionMapper(mapper)) {
    return mapper;
  }
  return createAiSdkInteractionMapper(mapper);
}

function isAiSdkInteractionMapper(
  value: AiSdkInteractionMapper | AiSdkInteractionMapperOptions | undefined,
): value is AiSdkInteractionMapper {
  return !!value && typeof value === "object" && "mapEvent" in value && "reset" in value;
}

function readMapMessages(options: AiSdkChatTransportOptions, messages: UIMessage[]) {
  return readMapMessagesFn(options)(messages);
}

function readMapMessagesFn(options: AiSdkChatTransportOptions) {
  return options.mapMessages ?? mapUiMessagesToInteractionMessages;
}

function mapUiMessagesToInteractionMessages(messages: UIMessage[]) {
  return maybeMap(mapModelMessages, convertToModelMessages(messages));
}

function mapModelMessages(messages: ModelMessage[]) {
  return messages.map(mapModelMessage);
}

function mapModelMessage(message: ModelMessage) {
  return fromAiSdkMessage(message);
}

function buildInteractionInput(
  config: BuildInputConfig,
  messages: Message[],
): InteractionHandleInput {
  const split = splitMessages(messages);
  const state = toInteractionState(split.history);
  return {
    message: split.input,
    state,
    interactionId: resolveInteractionId(config.transport.options, config.options.chatId),
    correlationId: resolveCorrelationId(config.transport.options, config.options.chatId),
  };
}

function splitMessages(messages: Message[]): SplitMessagesResult {
  const index = findLastUserMessageIndex(messages);
  if (index === -1) {
    return { history: messages };
  }
  return {
    history: messages.slice(0, index),
    input: messages[index],
  };
}

function findLastUserMessageIndex(messages: Message[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message && message.role === "user") {
      return i;
    }
  }
  return -1;
}

function toInteractionState(messages: Message[]): InteractionState {
  return {
    messages,
    diagnostics: [],
    trace: [],
  };
}

function resolveInteractionId(options: AiSdkChatTransportOptions, chatId: string) {
  if (options.interactionId) {
    return options.interactionId(chatId);
  }
  return chatId;
}

function resolveCorrelationId(options: AiSdkChatTransportOptions, chatId: string) {
  if (options.correlationId) {
    return options.correlationId(chatId);
  }
  return chatId;
}

function runInteractionHandle(
  config: RunConfig,
  input: InteractionHandleInput,
): MaybePromise<InteractionHandleResult> {
  return config.transport.options.handle.run(input, config.overrides);
}

function toUiMessageExecute<UI_MESSAGE extends UIMessage>(
  execute: (input: { writer: UIMessageStreamWriter<UI_MESSAGE> }) => MaybePromise<null>,
) {
  return execute as unknown as (input: {
    writer: UIMessageStreamWriter<UI_MESSAGE>;
  }) => void | Promise<void>;
}

function toUiMessageChunkStream(stream: ReadableStream<UIMessageChunk>) {
  return stream as ReadableStream<UIMessageChunk>;
}
