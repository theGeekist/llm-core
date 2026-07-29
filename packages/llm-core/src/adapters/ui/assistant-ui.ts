export { parseAssistantUiInboundEvents } from "./assistant-ui-inbound";
export type { AssistantUiInboundContext } from "./assistant-ui-inbound";
import type { JsonValue } from "#contracts";
import {
  projectInteractionEvent,
  type InteractionEvent,
  type InteractionUiEvent,
} from "../../application/interaction/public";
import type { UiProjectionMapper } from "./types";

export type AssistantUiProjectionCommand =
  | {
      readonly type: "add-message";
      readonly message: {
        readonly role: "assistant";
        readonly parts: readonly {
          readonly type: "text";
          readonly text: string;
        }[];
      };
    }
  | {
      readonly type: "add-tool-result";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly result: JsonValue;
      readonly isError: boolean;
    };

export interface AssistantUiProjectionOptions {
  readonly includeReasoning?: boolean;
  readonly reasoningPrefix?: string;
  readonly errorPrefix?: string;
}

interface MessageBuffer {
  text: string;
  reasoning: string;
}

const messageCommand = (texts: readonly string[]): AssistantUiProjectionCommand => ({
  type: "add-message",
  message: {
    role: "assistant",
    parts: texts.map((text) => ({ type: "text", text })),
  },
});

export const createAssistantUiProjectionMapper = (
  options: AssistantUiProjectionOptions = {},
): UiProjectionMapper<AssistantUiProjectionCommand> => {
  const buffers = new Map<string, MessageBuffer>();

  const bufferFor = (messageId: string): MessageBuffer => {
    const existing = buffers.get(messageId);
    if (existing) {
      return existing;
    }
    const created = { text: "", reasoning: "" };
    buffers.set(messageId, created);
    return created;
  };

  const mapProjection = (event: InteractionUiEvent): readonly AssistantUiProjectionCommand[] => {
    switch (event.kind) {
      case "message-started":
        buffers.set(event.messageId, { text: "", reasoning: "" });
        return [];
      case "text-delta":
        bufferFor(event.messageId).text += event.text;
        return [];
      case "reasoning-delta":
        bufferFor(event.messageId).reasoning += event.text;
        return [];
      case "tool-result":
        return [
          {
            type: "add-tool-result",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            result: event.projectedResult,
            isError: event.isError,
          },
        ];
      case "message-finished": {
        const buffer = bufferFor(event.messageId);
        buffers.delete(event.messageId);
        const texts = [
          ...(buffer.text ? [buffer.text] : []),
          ...(options.includeReasoning && buffer.reasoning
            ? [`${options.reasoningPrefix ?? "Reasoning: "}${buffer.reasoning}`]
            : []),
        ];
        return texts.length > 0 ? [messageCommand(texts)] : [];
      }
      case "message-failed":
        buffers.delete(event.messageId);
        return [messageCommand([`${options.errorPrefix ?? "Error: "}${event.reasonCode}`])];
      default:
        return [];
    }
  };

  return (event: InteractionEvent) => {
    const projected = projectInteractionEvent(event);
    return projected ? mapProjection(projected) : [];
  };
};
