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
  read(input: ConversationReadInput): MaybePromise<ConversationRecord | null>;
  append(input: ConversationAppendInput): MaybePromise<StorageMutationResult>;
  reset(input: ConversationResetInput): MaybePromise<StorageMutationResult>;
}

export interface ConversationReadInput {
  readonly context: InvocationContext;
  readonly conversationId: ConversationId;
}

export interface ConversationAppendInput extends ConversationReadInput {
  readonly turn: ConversationTurn;
}

export interface ConversationResetInput {
  readonly context: InvocationContext;
  readonly conversationId: ConversationId;
}

export interface ConversationStateStore {
  load(input: ConversationStateLoadInput): MaybePromise<JsonValue | null>;
  save(input: ConversationStateSaveInput): MaybePromise<StorageMutationResult>;
}

export interface ConversationStateLoadInput extends ConversationReadInput {
  readonly input: JsonObject;
}

export interface ConversationStateSaveInput extends ConversationReadInput {
  readonly state: {
    readonly input: JsonObject;
    readonly output: JsonObject;
  };
}
