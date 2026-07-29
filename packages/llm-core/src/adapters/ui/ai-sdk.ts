import type { JsonValue } from "#contracts";
import type {
  InteractionEvent,
  InteractionUiEvent,
} from "../../application/interaction/public";
import { withProjection } from "./shared";
import type { UiProjectionMapper } from "./types";

/**
 * Structural AI SDK UI chunks. The adapter boundary deliberately does not
 * export AI SDK types into the portable interaction application contract.
 */
export type AiSdkUiProjectionChunk =
  | { readonly type: "start"; readonly messageId: string }
  | { readonly type: "data-llm-core-status"; readonly data: JsonValue }
  | {
      readonly type: "finish";
      readonly finishReason: "stop" | "error" | "other";
    };

const statusData = (event: InteractionUiEvent): JsonValue => {
  switch (event.kind) {
    case "run-started":
      return { kind: event.kind, runId: event.runId, agentId: event.agentId };
    case "run-progress":
      return { kind: event.kind, runId: event.runId, code: event.code };
    case "intervention-requested":
      return {
        kind: event.kind,
        runId: event.runId,
        interventionId: event.interventionId,
        allowed: [...event.allowed],
        expiresAt: event.expiresAt,
      };
    case "cancellation-requested":
      return { kind: event.kind, runId: event.runId };
    case "tool-status":
      return {
        kind: event.kind,
        runId: event.runId,
        toolCallId: event.toolCallId,
        receiptState: event.receiptState,
        ...(event.reasonCode ? { reasonCode: event.reasonCode } : {}),
      };
    case "run-finished":
      return {
        kind: event.kind,
        runId: event.runId,
        status: event.status,
        ...(event.reasonCode ? { reasonCode: event.reasonCode } : {}),
      };
    default:
      throw new TypeError("Unknown interaction UI event.");
  }
};

const mapProjection = (event: InteractionUiEvent): readonly AiSdkUiProjectionChunk[] => {
  if (event.kind === "run-started") {
    return [
      { type: "start", messageId: event.runId },
      { type: "data-llm-core-status", data: statusData(event) },
    ];
  }
  if (event.kind === "run-finished") {
    return [
      { type: "data-llm-core-status", data: statusData(event) },
      {
        type: "finish",
        finishReason:
          event.status === "completed"
            ? "stop"
            : event.status === "failed"
              ? "error"
              : "other",
      },
    ];
  }
  return [{ type: "data-llm-core-status", data: statusData(event) }];
};

export const createAiSdkUiProjectionMapper = (): UiProjectionMapper<AiSdkUiProjectionChunk> =>
  (event: InteractionEvent) => withProjection(mapProjection, event);
