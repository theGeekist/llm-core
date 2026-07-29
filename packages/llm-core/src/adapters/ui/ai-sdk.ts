import type { UIMessageChunk } from "ai";
export { createAiSdkUiWebSocketTransport } from "./ai-sdk-websocket";
export type {
  AiSdkUiAuthToken,
  AiSdkUiWebSocketData,
  AiSdkUiWebSocketEvent,
  AiSdkUiWebSocketTransportOptions,
} from "./ai-sdk-websocket";
import type { JsonValue } from "#contracts";
import {
  projectInteractionEvent,
  type InteractionEvent,
  type InteractionUiEvent,
} from "../../application/interaction/public";
import type { UiProjectionMapper } from "./types";

type LlmCoreUiData = {
  readonly "llm-core-status": JsonValue;
};

export type AiSdkUiProjectionChunk = UIMessageChunk<unknown, LlmCoreUiData>;

const statusData = (event: InteractionUiEvent): JsonValue => ({
  kind: event.kind,
  runId: event.runId,
});

export const createAiSdkUiProjectionMapper = (): UiProjectionMapper<AiSdkUiProjectionChunk> => {
  const textParts = new Set<string>();
  const reasoningParts = new Set<string>();

  const closeParts = (messageId: string): AiSdkUiProjectionChunk[] => {
    const chunks: AiSdkUiProjectionChunk[] = [];
    if (textParts.delete(messageId)) {
      chunks.push({ type: "text-end", id: `${messageId}:text` });
    }
    if (reasoningParts.delete(messageId)) {
      chunks.push({ type: "reasoning-end", id: `${messageId}:reasoning` });
    }
    return chunks;
  };

  const mapProjection = (event: InteractionUiEvent): AiSdkUiProjectionChunk[] => {
    switch (event.kind) {
      case "message-started":
        return [{ type: "start", messageId: event.messageId }];
      case "text-delta": {
        const id = `${event.messageId}:text`;
        const chunks: AiSdkUiProjectionChunk[] = [];
        if (!textParts.has(event.messageId)) {
          textParts.add(event.messageId);
          chunks.push({ type: "text-start", id });
        }
        chunks.push({ type: "text-delta", id, delta: event.text });
        return chunks;
      }
      case "reasoning-delta": {
        const id = `${event.messageId}:reasoning`;
        const chunks: AiSdkUiProjectionChunk[] = [];
        if (!reasoningParts.has(event.messageId)) {
          reasoningParts.add(event.messageId);
          chunks.push({ type: "reasoning-start", id });
        }
        chunks.push({ type: "reasoning-delta", id, delta: event.text });
        return chunks;
      }
      case "tool-call":
        return [
          {
            type: "tool-input-available",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            input: event.projectedInput,
          },
        ];
      case "tool-result":
        return event.isError
          ? [
              {
                type: "tool-output-error",
                toolCallId: event.toolCallId,
                errorText: "Tool execution failed.",
              },
            ]
          : [
              {
                type: "tool-output-available",
                toolCallId: event.toolCallId,
                output: event.projectedResult,
              },
            ];
      case "message-finished":
        return [...closeParts(event.messageId), { type: "finish", finishReason: "stop" }];
      case "message-failed":
        return [
          ...closeParts(event.messageId),
          { type: "error", errorText: event.reasonCode },
          { type: "finish", finishReason: "error" },
        ];
      default:
        return [
          {
            type: "data-llm-core-status",
            data: statusData(event),
          },
        ];
    }
  };

  return (event: InteractionEvent) => {
    const projected = projectInteractionEvent(event);
    return projected ? mapProjection(projected) : [];
  };
};
