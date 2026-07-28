import type { AssistantTransportCommand } from "@assistant-ui/react";
import type { ReadonlyJSONValue } from "assistant-stream/utils";
import type { ModelStreamEvent } from "../types";
import type { InteractionEvent, InteractionEventMeta } from "../../interaction/types";
import { bindFirst } from "#shared/fp";
import { isRecord } from "#shared/guards";
import {
  createInteractionEventDeliverySink,
  createInteractionEventDeliveryStream,
} from "../primitives/interaction-event-emitter";
import { toAssistantUiJsonValue } from "./json";

export type AssistantUiInteractionMapperOptions = {
  includeReasoning?: boolean;
  reasoningPrefix?: string;
  errorPrefix?: string;
};

type AssistantUiInteractionMapper = {
  mapEvent: (event: InteractionEvent) => AssistantTransportCommand[];
  reset: () => void;
};

export type AssistantUiCommandMapper = (event: InteractionEvent) => AssistantTransportCommand[];

export type AssistantUiInteractionSinkOptions = {
  sendCommand: (command: AssistantTransportCommand) => void;
  mapper?: AssistantUiCommandMapper;
};

export type AssistantUiInteractionEventStreamOptions = {
  sendCommand: (command: AssistantTransportCommand) => void;
  mapper?: AssistantUiCommandMapper;
};

type ModelDeltaEvent = Extract<ModelStreamEvent, { type: "delta" }>;

type TextPart = {
  readonly type: "text";
  readonly text: string;
};

type AddMessageCommand = {
  readonly type: "add-message";
  readonly message: {
    readonly role: "assistant";
    readonly parts: readonly TextPart[];
  };
};

type AddToolResultCommand = {
  readonly type: "add-tool-result";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly result: ReadonlyJSONValue;
  readonly isError: boolean;
  readonly artefact?: ReadonlyJSONValue;
};

const DEFAULT_REASONING_PREFIX = "Reasoning: ";
const DEFAULT_ERROR_PREFIX = "Error: ";

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

const toToolCallId = (meta: InteractionEventMeta, name: string, toolCallId?: string | null) => {
  if (toolCallId) {
    return toolCallId;
  }
  return `${meta.sourceId}:${name}:${meta.sequence}`;
};

const toTextPart = (text: string): TextPart => ({ type: "text", text });

const toAssistantMessageCommand = (parts: TextPart[]): AddMessageCommand => ({
  type: "add-message",
  message: {
    role: "assistant",
    parts,
  },
});

type ToolResultCommandInput = {
  meta: InteractionEventMeta;
  toolName: string;
  result: unknown;
  toolCallId?: string | null;
  isError?: boolean | null;
};

const toToolResultCommand = (input: ToolResultCommandInput): AddToolResultCommand => ({
  type: "add-tool-result",
  toolCallId: toToolCallId(input.meta, input.toolName, input.toolCallId),
  toolName: input.toolName,
  result: toAssistantUiJsonValue(input.result),
  isError: input.isError === true,
});

const appendCommand = (
  target: AssistantTransportCommand[],
  command: AssistantTransportCommand | null,
) => {
  if (command) {
    target.push(command);
  }
};

const hasText = (value: string | null) => !!value && value.trim().length > 0;

class AssistantUiInteractionMapperImpl implements AssistantUiInteractionMapper {
  private options: AssistantUiInteractionMapperOptions;
  private textBuffer: string | null;
  private reasoningBuffer: string | null;

  constructor(options?: AssistantUiInteractionMapperOptions) {
    this.options = options ?? {};
    this.textBuffer = null;
    this.reasoningBuffer = null;
  }

  reset() {
    this.textBuffer = null;
    this.reasoningBuffer = null;
  }

  mapEvent(event: InteractionEvent): AssistantTransportCommand[] {
    if (event.kind !== "model") {
      return [];
    }
    return this.mapModelEvent(event);
  }

  private mapModelEvent(event: InteractionEvent & { kind: "model" }) {
    if (event.event.type === "start") {
      this.reset();
      return [];
    }

    if (event.event.type === "delta") {
      return this.mapDeltaEvent(event.event, event.meta);
    }

    if (event.event.type === "end") {
      return this.flushMessage(event.event.text ?? null);
    }

    if (event.event.type === "error") {
      return this.flushError(event.event.error);
    }

    return [];
  }

  private mapDeltaEvent(delta: ModelDeltaEvent, meta: InteractionEventMeta) {
    const commands: AssistantTransportCommand[] = [];

    if (delta.text) {
      this.appendText(delta.text);
    }

    if (delta.reasoning) {
      this.appendReasoning(delta.reasoning);
    }

    if (delta.toolResult) {
      appendCommand(
        commands,
        toToolResultCommand({
          meta,
          toolName: delta.toolResult.name,
          result: delta.toolResult.result,
          toolCallId: delta.toolResult.toolCallId,
          isError: delta.toolResult.isError,
        }),
      );
    }

    return commands;
  }

  private appendText(text: string) {
    if (!text) {
      return;
    }
    this.textBuffer = (this.textBuffer ?? "") + text;
  }

  private appendReasoning(reasoning: string) {
    if (!this.options.includeReasoning || !reasoning) {
      return;
    }
    this.reasoningBuffer = (this.reasoningBuffer ?? "") + reasoning;
  }

  private flushMessage(fallbackText: string | null): AssistantTransportCommand[] {
    const commands: AssistantTransportCommand[] = [];
    const parts: TextPart[] = [];

    const text = hasText(this.textBuffer) ? this.textBuffer : fallbackText;
    if (text) {
      parts.push(toTextPart(text));
    }

    if (hasText(this.reasoningBuffer) && this.options.includeReasoning) {
      parts.push(
        toTextPart(
          `${this.options.reasoningPrefix ?? DEFAULT_REASONING_PREFIX}${
            this.reasoningBuffer ?? ""
          }`,
        ),
      );
    }

    if (parts.length > 0) {
      commands.push(toAssistantMessageCommand(parts));
    }

    this.reset();
    return commands;
  }

  private flushError(error: unknown): AssistantTransportCommand[] {
    const prefix = this.options.errorPrefix ?? DEFAULT_ERROR_PREFIX;
    const text = `${prefix}${toErrorText(error)}`;
    const commands: AssistantTransportCommand[] = [];
    commands.push(toAssistantMessageCommand([toTextPart(text)]));
    this.reset();
    return commands;
  }
}

const createAssistantUiInteractionMapper = (
  options?: AssistantUiInteractionMapperOptions,
): AssistantUiInteractionMapper => new AssistantUiInteractionMapperImpl(options);

const sendCommands = (
  sendCommand: (command: AssistantTransportCommand) => void,
  commands: AssistantTransportCommand[],
) => {
  if (commands.length === 0) {
    return null;
  }
  try {
    for (const command of commands) {
      sendCommand(command);
    }
    return true;
  } catch {
    return false;
  }
};

export const createAssistantUiInteractionSink = (options: AssistantUiInteractionSinkOptions) =>
  createInteractionEventDeliverySink({
    mapper: { mapEvent: options.mapper ?? createAssistantUiCommandMapper() },
    deliver: bindFirst(sendCommands, options.sendCommand),
  });

export const createAssistantUiInteractionEventStream = (
  options: AssistantUiInteractionEventStreamOptions,
) =>
  createInteractionEventDeliveryStream({
    mapper: { mapEvent: options.mapper ?? createAssistantUiCommandMapper() },
    deliver: bindFirst(sendCommands, options.sendCommand),
  });

const mapAssistantUiCommands = (
  mapper: AssistantUiInteractionMapper,
  event: InteractionEvent,
): AssistantTransportCommand[] => mapper.mapEvent(event);

export const createAssistantUiCommandMapper = (
  options?: AssistantUiInteractionMapperOptions,
): AssistantUiCommandMapper =>
  bindFirst(mapAssistantUiCommands, createAssistantUiInteractionMapper(options));
