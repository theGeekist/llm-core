import {
  coreId,
  digest,
  type ConversationId,
  type InvocationContext,
  type InvocationId,
  type ResourceId,
} from "#contracts";

export const context: InvocationContext = Object.freeze({
  invocationId: coreId<InvocationId>("0190bd0c-0000-4000-8000-000000000101"),
});

export const conversationId = coreId<ConversationId>("0190bd0c-0000-4000-8000-000000000102");

export const resource = Object.freeze({
  resourceId: coreId<ResourceId>("0190bd0c-0000-4000-8000-000000000103"),
  mediaType: "application/octet-stream",
  byteLength: 3,
  digest: digest("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"),
});
