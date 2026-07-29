import type {
  InteractionEvent,
  InteractionUiEvent,
} from "../../application/interaction/public";

export type UiProjectionMapper<TProjection> = (
  event: InteractionEvent,
) => readonly TProjection[];

export type InteractionUiProjector = (
  event: InteractionEvent,
) => InteractionUiEvent | null;
