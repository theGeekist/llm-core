import {
  projectInteractionEvent,
  type InteractionEvent,
  type InteractionUiEvent,
} from "../../application/interaction/public";

export const withProjection = <T>(
  map: (event: InteractionUiEvent) => readonly T[],
  event: InteractionEvent,
): readonly T[] => {
  const projected = projectInteractionEvent(event);
  return projected ? map(projected) : [];
};

export const statusText = (event: InteractionUiEvent): string => {
  switch (event.kind) {
    case "run-started":
      return "started";
    case "run-progress":
      return event.code;
    case "intervention-requested":
      return "awaiting intervention";
    case "cancellation-requested":
      return "cancellation requested";
    case "tool-status":
      return `tool ${event.receiptState}`;
    case "run-finished":
      return event.status;
    default:
      throw new TypeError("Unknown interaction UI event.");
  }
};
