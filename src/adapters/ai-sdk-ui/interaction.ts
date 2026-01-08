import type { FinishReason, UIMessageChunk, UIMessageStreamWriter } from "ai";
import type { EventStream, EventStreamEvent, ModelStreamEvent } from "../types";
import type { InteractionEvent, InteractionEventMeta } from "../../interaction/types";
import { isRecord } from "../../shared/guards";

export type AiSdkInteractionMapperOptions = {
  messageId?: string;
  messageMetadata?: unknown;
  dataIdPrefix?: string;
  traceTransient?: boolean;
  diagnosticTransient?: boolean;
  queryTransient?: boolean;
  eventTransient?: boolean;
};

export type AiSdkInteractionMapper = {
  mapEvent: (event: InteractionEvent) => UIMessageChunk[];
  reset: () => void;
};

export type AiSdkInteractionSinkOptions = {
  writer: UIMessageStreamWriter;
  mapper?: AiSdkInteractionMapper;
};

export type AiSdkInteractionEventStreamOptions = {
  writer: UIMessageStreamWriter;
  mapper?: AiSdkInteractionMapper;
};

type InteractionDataChunk = {
  type: `data-${string}`;
  data: unknown;
  id?: string;
  transient?: boolean;
};

type ModelDeltaEvent = Extract<ModelStreamEvent, { type: "delta" }>;

const DEFAULT_MESSAGE_ID = "interaction";

const FINISH_REASONS: FinishReason[] = [
  "other",
  "length",
  "unknown",
  "error",
  "stop",
  "content-filter",
  "tool-calls",
];

const isKnownFinishReason = (value: string): value is FinishReason =>
  FINISH_REASONS.includes(value as FinishReason);

const toFinishReason = (value?: string | null): FinishReason => {
  if (!value) {
    return "unknown";
  }
  if (isKnownFinishReason(value)) {
    return value;
  }
  return "unknown";
};

const toErrorText = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (isRecord(error)) {
    const message = error.message;
    if (typeof message === "string") {
      return message;
    }
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

const toMessageId = (meta: InteractionEventMeta, fallback?: string | null) => {
  if (fallback) {
    return fallback;
  }
  if (meta.interactionId) {
    return meta.interactionId;
  }
  if (meta.sourceId) {
    return meta.sourceId;
  }
  return `${meta.sequence}`;
};

const toTextPartId = (messageId: string) => `${messageId}:text`;
const toReasoningPartId = (messageId: string) => `${messageId}:reasoning`;

const toToolCallId = (messageId: string, toolName: string, toolCallId?: string | null) => {
  if (toolCallId) {
    return toolCallId;
  }
  return `${messageId}:tool:${toolName}`;
};

const toDataId = (meta: InteractionEventMeta, prefix?: string) => {
  const base = prefix ?? meta.sourceId ?? DEFAULT_MESSAGE_ID;
  return `${base}:${meta.sequence}`;
};

type DataChunkInput = {
  name: string;
  data: unknown;
  meta: InteractionEventMeta;
  options: AiSdkInteractionMapperOptions;
  transient?: boolean;
};

const toDataChunk = (input: DataChunkInput): InteractionDataChunk => ({
  type: `data-${input.name}`,
  data: input.data,
  id: toDataId(input.meta, input.options.dataIdPrefix),
  transient: input.transient,
});

const createStartChunk = (messageId: string, messageMetadata: unknown | null): UIMessageChunk => {
  const chunk: UIMessageChunk = { type: "start", messageId };
  if (messageMetadata !== null) {
    chunk.messageMetadata = messageMetadata;
  }
  return chunk;
};

const createFinishChunk = (
  messageMetadata: unknown | null,
  finishReason: FinishReason,
): UIMessageChunk => {
  const chunk: UIMessageChunk = { type: "finish", finishReason };
  if (messageMetadata !== null) {
    chunk.messageMetadata = messageMetadata;
  }
  return chunk;
};

const appendChunks = (target: UIMessageChunk[], source: UIMessageChunk[]) => {
  for (const chunk of source) {
    target.push(chunk);
  }
};

const appendChunk = (target: UIMessageChunk[], chunk: UIMessageChunk) => {
  target.push(chunk);
};

class AiSdkInteractionMapperImpl implements AiSdkInteractionMapper {
  private options: AiSdkInteractionMapperOptions;
  private messageId: string | null;
  private textStarted: boolean;
  private reasoningStarted: boolean;

  constructor(options?: AiSdkInteractionMapperOptions) {
    this.options = options ?? {};
    this.messageId = options?.messageId ?? null;
    this.textStarted = false;
    this.reasoningStarted = false;
  }

  reset() {
    this.textStarted = false;
    this.reasoningStarted = false;
    this.messageId = this.options.messageId ?? null;
  }

  mapEvent(event: InteractionEvent): UIMessageChunk[] {
    if (event.kind === "model") {
      return this.mapModelEvent(event);
    }
    return this.mapNonModelEvent(event);
  }

  private mapNonModelEvent(event: InteractionEvent): UIMessageChunk[] {
    const chunks: UIMessageChunk[] = [];
    if (event.kind === "trace") {
      appendChunk(
        chunks,
        toDataChunk({
          name: "trace",
          data: event.event,
          meta: event.meta,
          options: this.options,
          transient: this.options.traceTransient ?? true,
        }),
      );
      return chunks;
    }
    if (event.kind === "diagnostic") {
      appendChunk(
        chunks,
        toDataChunk({
          name: "diagnostic",
          data: event.entry,
          meta: event.meta,
          options: this.options,
          transient: this.options.diagnosticTransient ?? true,
        }),
      );
      return chunks;
    }
    if (event.kind === "query") {
      appendChunk(
        chunks,
        toDataChunk({
          name: "query",
          data: event.event,
          meta: event.meta,
          options: this.options,
          transient: this.options.queryTransient,
        }),
      );
      return chunks;
    }
    if (event.kind === "event-stream") {
      appendChunk(
        chunks,
        toDataChunk({
          name: "event",
          data: event.event,
          meta: event.meta,
          options: this.options,
          transient: this.options.eventTransient,
        }),
      );
      return chunks;
    }
    return chunks;
  }

  private mapModelEvent(event: InteractionEvent & { kind: "model" }): UIMessageChunk[] {
    const chunks: UIMessageChunk[] = [];
    const messageMetadata = this.options.messageMetadata ?? null;

    if (event.event.type === "start") {
      this.reset();
      const messageId = this.resolveMessageId(event);
      appendChunk(chunks, createStartChunk(messageId, messageMetadata));
      return chunks;
    }

    if (event.event.type === "usage") {
      appendChunk(
        chunks,
        toDataChunk({
          name: "usage",
          data: event.event.usage,
          meta: event.meta,
          options: this.options,
        }),
      );
      return chunks;
    }

    if (event.event.type === "error") {
      const messageId = this.resolveMessageId(event);
      this.appendEndChunks(chunks, messageId);
      appendChunk(chunks, { type: "error", errorText: toErrorText(event.event.error) });
      appendChunk(chunks, createFinishChunk(messageMetadata, "error"));
      return chunks;
    }

    if (event.event.type === "end") {
      const messageId = this.resolveMessageId(event);
      this.appendEndChunks(chunks, messageId);
      appendChunk(
        chunks,
        createFinishChunk(messageMetadata, toFinishReason(event.event.finishReason)),
      );
      if (event.event.diagnostics?.length) {
        appendChunk(
          chunks,
          toDataChunk({
            name: "diagnostic",
            data: event.event.diagnostics,
            meta: event.meta,
            options: this.options,
          }),
        );
      }
      if (event.event.sources?.length) {
        appendChunk(
          chunks,
          toDataChunk({
            name: "sources",
            data: event.event.sources,
            meta: event.meta,
            options: this.options,
          }),
        );
      }
      return chunks;
    }

    if (event.event.type === "delta") {
      this.appendDeltaChunks({
        chunks,
        messageId: this.resolveMessageId(event),
        event: event.event,
        meta: event.meta,
      });
      return chunks;
    }

    return chunks;
  }

  private resolveMessageId(event: InteractionEvent & { kind: "model" }) {
    if (this.options.messageId) {
      return this.options.messageId;
    }
    if (!this.messageId) {
      this.messageId = toMessageId(
        event.meta,
        event.event.type === "start" ? event.event.id : null,
      );
    }
    return this.messageId;
  }

  private appendDeltaChunks(input: {
    chunks: UIMessageChunk[];
    messageId: string;
    event: ModelDeltaEvent;
    meta: InteractionEventMeta;
  }) {
    const textId = toTextPartId(input.messageId);
    const reasoningId = toReasoningPartId(input.messageId);

    if (input.event.text) {
      if (!this.textStarted) {
        appendChunk(input.chunks, { type: "text-start", id: textId });
        this.textStarted = true;
      }
      appendChunk(input.chunks, {
        type: "text-delta",
        id: textId,
        delta: input.event.text,
      });
    }

    if (input.event.reasoning) {
      if (!this.reasoningStarted) {
        appendChunk(input.chunks, { type: "reasoning-start", id: reasoningId });
        this.reasoningStarted = true;
      }
      appendChunk(input.chunks, {
        type: "reasoning-delta",
        id: reasoningId,
        delta: input.event.reasoning,
      });
    }

    if (input.event.toolCall) {
      const toolCallId = toToolCallId(
        input.messageId,
        input.event.toolCall.name,
        input.event.toolCall.id,
      );
      appendChunk(input.chunks, {
        type: "tool-input-available",
        toolCallId,
        toolName: input.event.toolCall.name,
        input: input.event.toolCall.arguments,
      });
    }

    if (input.event.toolResult) {
      const toolCallId = toToolCallId(
        input.messageId,
        input.event.toolResult.name,
        input.event.toolResult.toolCallId,
      );
      if (input.event.toolResult.isError) {
        appendChunk(input.chunks, {
          type: "tool-output-error",
          toolCallId,
          errorText: toErrorText(input.event.toolResult.result),
        });
      } else {
        appendChunk(input.chunks, {
          type: "tool-output-available",
          toolCallId,
          output: input.event.toolResult.result,
        });
      }
    }

    if (input.event.sources?.length) {
      appendChunk(
        input.chunks,
        toDataChunk({
          name: "sources",
          data: input.event.sources,
          meta: input.meta,
          options: this.options,
        }),
      );
    }
  }

  private appendEndChunks(chunks: UIMessageChunk[], messageId: string) {
    const textId = toTextPartId(messageId);
    const reasoningId = toReasoningPartId(messageId);

    if (this.textStarted) {
      appendChunk(chunks, { type: "text-end", id: textId });
      this.textStarted = false;
    }

    if (this.reasoningStarted) {
      appendChunk(chunks, { type: "reasoning-end", id: reasoningId });
      this.reasoningStarted = false;
    }
  }
}

export const createAiSdkInteractionMapper = (
  options?: AiSdkInteractionMapperOptions,
): AiSdkInteractionMapper => new AiSdkInteractionMapperImpl(options);

class AiSdkInteractionSinkImpl {
  private writer: UIMessageStreamWriter;
  private mapper: AiSdkInteractionMapper;

  constructor(options: AiSdkInteractionSinkOptions) {
    this.writer = options.writer;
    this.mapper = options.mapper ?? createAiSdkInteractionMapper();
  }

  onEvent(event: InteractionEvent) {
    const chunks = this.mapper.mapEvent(event);
    return writeChunks(this.writer, chunks);
  }
}

class AiSdkInteractionEventStreamImpl implements EventStream {
  private writer: UIMessageStreamWriter;
  private mapper: AiSdkInteractionMapper;

  constructor(options: AiSdkInteractionEventStreamOptions) {
    this.writer = options.writer;
    this.mapper = options.mapper ?? createAiSdkInteractionMapper();
  }

  emit(event: EventStreamEvent) {
    const interactionEvent = toInteractionEvent(event);
    if (!interactionEvent) {
      return null;
    }
    const chunks = this.mapper.mapEvent(interactionEvent);
    return writeChunks(this.writer, chunks);
  }

  emitMany(events: EventStreamEvent[]) {
    const chunks: UIMessageChunk[] = [];
    for (const event of events) {
      const interactionEvent = toInteractionEvent(event);
      if (!interactionEvent) {
        continue;
      }
      appendChunks(chunks, this.mapper.mapEvent(interactionEvent));
    }
    if (!chunks.length) {
      return null;
    }
    return writeChunks(this.writer, chunks);
  }
}

const toInteractionEvent = (event: EventStreamEvent): InteractionEvent | null => {
  if (!event.data || !isRecord(event.data)) {
    return null;
  }
  const candidate = event.data.event;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  return candidate as InteractionEvent;
};

const writeChunks = (writer: UIMessageStreamWriter, chunks: UIMessageChunk[]) => {
  if (!chunks.length) {
    return null;
  }
  try {
    for (const chunk of chunks) {
      writer.write(chunk);
    }
    return true;
  } catch {
    return false;
  }
};

export const createAiSdkInteractionSink = (options: AiSdkInteractionSinkOptions) =>
  new AiSdkInteractionSinkImpl(options);

export const createAiSdkInteractionEventStream = (options: AiSdkInteractionEventStreamOptions) =>
  new AiSdkInteractionEventStreamImpl(options);

export const toAiSdkUiMessageChunks = (
  input: AiSdkInteractionMapper | AiSdkInteractionMapperOptions | undefined,
  event: InteractionEvent,
): UIMessageChunk[] => {
  const mapper = isAiSdkInteractionMapper(input) ? input : createAiSdkInteractionMapper(input);
  return mapper.mapEvent(event);
};

const isAiSdkInteractionMapper = (
  value: AiSdkInteractionMapper | AiSdkInteractionMapperOptions | undefined,
): value is AiSdkInteractionMapper =>
  isRecord(value) &&
  "mapEvent" in value &&
  "reset" in value &&
  typeof (value as { mapEvent?: unknown }).mapEvent === "function" &&
  typeof (value as { reset?: unknown }).reset === "function";
