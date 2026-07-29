import type {
  InteractionEvent,
  InteractionUiEvent,
} from "../../application/interaction/public";
import { statusText, withProjection } from "./shared";
import type { UiProjectionMapper } from "./types";

export interface AssistantUiTextPart {
  readonly type: "text";
  readonly text: string;
}

export interface AssistantUiProjectionCommand {
  readonly type: "add-message";
  readonly message: {
    readonly role: "assistant";
    readonly parts: readonly AssistantUiTextPart[];
  };
}

export interface AssistantUiProjectionOptions {
  readonly includeProgress?: boolean;
  readonly prefix?: string;
}

const mapProjection = (
  options: AssistantUiProjectionOptions,
  event: InteractionUiEvent,
): readonly AssistantUiProjectionCommand[] => {
  if (event.kind === "run-progress" && options.includeProgress !== true) {
    return [];
  }
  return [
    {
      type: "add-message",
      message: {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: `${options.prefix ?? ""}${statusText(event)}`,
          },
        ],
      },
    },
  ];
};

export const createAssistantUiProjectionMapper = (
  options: AssistantUiProjectionOptions = {},
): UiProjectionMapper<AssistantUiProjectionCommand> =>
  (event: InteractionEvent) =>
    withProjection((projection) => mapProjection(options, projection), event);
