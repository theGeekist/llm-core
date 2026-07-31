import type { ConversationEvent, InteractionEvent } from "../../application/interaction/public";

export type UiProjectionMapper<TProjection> = (event: InteractionEvent) => readonly TProjection[];

export type InteractionUiProjector = (event: InteractionEvent) => ConversationEvent | null;
