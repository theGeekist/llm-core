import {
  createInteractionProjection,
  interactionContentEvent,
  reduceInteractionProjection,
  registerInteractionContentEvent,
} from "@aifsd/llm-core/interaction";
import {
  newCoreId,
  type ConversationId,
  type EventId,
  type RunId,
} from "@aifsd/llm-core/contracts";

const conversationId = newCoreId<ConversationId>("018f0f4e-8c5b-7a91-8c3b-123456789c01");
const source = registerInteractionContentEvent({
  eventId: newCoreId<EventId>("018f0f4e-8c5b-7a91-8c3b-123456789c02"),
  kind: "interaction.message.started",
  occurredAt: "2026-07-30T00:00:00.000Z",
  sequence: 0,
  runId: newCoreId<RunId>("018f0f4e-8c5b-7a91-8c3b-123456789c03"),
  facts: { messageId: "message-1" },
  redaction: { kind: "not-required" },
});

const event = interactionContentEvent(conversationId, source);
const projection = reduceInteractionProjection(createInteractionProjection(conversationId), event);

console.log(projection.events[0]?.kind);
