import type {
  ConversationId,
  InvocationContext,
  JsonObject,
  JsonValue,
  JsonContent,
  MediaRefContent,
  TextContent,
} from "#contracts";
import type { ModelRole, ReasoningPart, ToolCallPart } from "../model/public";
import type { MaybePromise } from "#shared/maybe";
import type { StorageMutationResult } from "../storage/public";

export type ConversationPortableContent = TextContent | JsonContent | MediaRefContent;

export interface ConversationToolResultPart {
  readonly kind: "tool-result";
  readonly toolCallId: ToolCallPart["toolCallId"];
  readonly result: ConversationPortableContent[];
  readonly isError?: boolean;
}

export type ConversationContentPart =
  | ConversationPortableContent
  | ReasoningPart
  | ToolCallPart
  | ConversationToolResultPart;

export interface ConversationTurn {
  readonly role: ModelRole;
  readonly content: ConversationContentPart[];
  readonly occurredAt?: string;
}

export interface ConversationRecord {
  readonly conversationId: ConversationId;
  readonly turns: ConversationTurn[];
  readonly revision: number;
}

export interface ConversationStore {
  read(
    context: InvocationContext,
    conversationId: ConversationId,
  ): MaybePromise<ConversationRecord | null>;
  append(
    context: InvocationContext,
    conversationId: ConversationId,
    turn: ConversationTurn,
  ): MaybePromise<StorageMutationResult>;
  reset(
    context: InvocationContext,
    conversationId: ConversationId,
  ): MaybePromise<StorageMutationResult>;
}

export interface ConversationStateStore {
  load(
    context: InvocationContext,
    conversationId: ConversationId,
    input: JsonObject,
  ): MaybePromise<JsonValue | null>;
  save(
    context: InvocationContext,
    conversationId: ConversationId,
    state: {
      readonly input: JsonObject;
      readonly output: JsonObject;
    },
  ): MaybePromise<StorageMutationResult>;
}
