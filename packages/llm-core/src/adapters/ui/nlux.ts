import type {
  InteractionEvent,
  InteractionUiEvent,
} from "../../application/interaction/public";
import { statusText, withProjection } from "./shared";
import type { UiProjectionMapper } from "./types";

export type NluxProjectionSignal =
  | { readonly type: "next"; readonly chunk: string }
  | { readonly type: "complete" }
  | { readonly type: "error"; readonly code: string };

const mapProjection = (event: InteractionUiEvent): readonly NluxProjectionSignal[] => {
  if (event.kind === "run-finished") {
    if (event.status === "failed") {
      return [{ type: "error", code: event.reasonCode ?? "agent-run-failed" }];
    }
    return [{ type: "complete" }];
  }
  if (event.kind === "run-progress") {
    return [{ type: "next", chunk: statusText(event) }];
  }
  return [];
};

export const createNluxProjectionMapper = (): UiProjectionMapper<NluxProjectionSignal> =>
  (event: InteractionEvent) => withProjection(mapProjection, event);
