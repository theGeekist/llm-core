import type { JsonValue } from "#contracts";
import type {
  InteractionEvent,
  InteractionUiEvent,
} from "../../application/interaction/public";
import { withProjection } from "./shared";
import type { UiProjectionMapper } from "./types";

export type ChatKitProjectionEvent =
  | { readonly type: "chatkit.response.start" }
  | { readonly type: "chatkit.response.end" }
  | {
      readonly type: "chatkit.error";
      readonly detail: { readonly code: string };
    }
  | {
      readonly type: "chatkit.log";
      readonly detail: {
        readonly name: string;
        readonly data: JsonValue;
      };
    };

const logEvent = (event: InteractionUiEvent): ChatKitProjectionEvent => ({
  type: "chatkit.log",
  detail: {
    name: `llm-core.${event.kind}`,
    data:
      event.kind === "tool-status"
        ? {
            runId: event.runId,
            toolCallId: event.toolCallId,
            receiptState: event.receiptState,
          }
        : { runId: event.runId },
  },
});

const mapProjection = (event: InteractionUiEvent): readonly ChatKitProjectionEvent[] => {
  if (event.kind === "run-started") {
    return [{ type: "chatkit.response.start" }];
  }
  if (event.kind === "run-finished") {
    if (event.status === "failed") {
      return [
        {
          type: "chatkit.error",
          detail: { code: event.reasonCode ?? "agent-run-failed" },
        },
        { type: "chatkit.response.end" },
      ];
    }
    return [{ type: "chatkit.response.end" }];
  }
  return [logEvent(event)];
};

export const createChatKitProjectionMapper = (): UiProjectionMapper<ChatKitProjectionEvent> =>
  (event: InteractionEvent) => withProjection(mapProjection, event);
