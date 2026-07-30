import type { ChatKitEvents } from "@openai/chatkit";
import {
  projectInteractionEvent,
  type InteractionEvent,
  type InteractionUiEvent,
} from "../../application/interaction/public";
import type { UiProjectionMapper } from "./types";

export type ChatKitProjectionEvent =
  | ChatKitEvents["chatkit.response.start"]
  | ChatKitEvents["chatkit.response.end"]
  | ChatKitEvents["chatkit.error"]
  | ChatKitEvents["chatkit.effect"];

const chatKitEvent = <K extends keyof ChatKitEvents>(
  type: K,
  detail: ChatKitEvents[K]["detail"],
): ChatKitEvents[K] => new CustomEvent(type, { detail }) as ChatKitEvents[K];

const mapProjection = (event: InteractionUiEvent): readonly ChatKitProjectionEvent[] => {
  switch (event.kind) {
    case "message-started":
      return [chatKitEvent("chatkit.response.start", undefined)];
    case "message-finished":
      return [chatKitEvent("chatkit.response.end", undefined)];
    case "message-failed":
      return [
        chatKitEvent("chatkit.error", { error: new Error(event.reasonCode) }),
        chatKitEvent("chatkit.response.end", undefined),
      ];
    case "tool-call":
    case "tool-result":
      return [
        chatKitEvent("chatkit.effect", {
          name: `llm-core.${event.kind}`,
          data: {
            runId: event.runId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
          },
        }),
      ];
    default:
      return [];
  }
};

export const createChatKitProjectionMapper =
  (): UiProjectionMapper<ChatKitProjectionEvent> => (event: InteractionEvent) => {
    const projected = projectInteractionEvent(event);
    return projected ? mapProjection(projected) : [];
  };
