import { isJsonValue, type JsonValue } from "#contracts";
import { maybeMap, type MaybePromise } from "#shared/maybe";
import {
  registerConversationRecord,
  registerConversationTurn,
  type ConversationRecord,
  type ConversationStateStore,
  type ConversationStore,
  type ConversationTurn,
} from "../../../../features/memory/public";

export interface AiSdkConversationMessage {
  readonly chatId?: string;
  readonly userId?: string;
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string | readonly unknown[];
  readonly timestamp?: Date;
  readonly metadata?: unknown;
}

export interface AiSdkWorkingMemory {
  readonly content: string;
  readonly updatedAt?: Date;
  readonly metadata?: unknown;
}

export interface AiSdkMemoryProvider {
  getMessages?(input: {
    chatId: string;
    userId?: string;
  }): MaybePromise<AiSdkConversationMessage[]>;
  saveMessage?(message: AiSdkConversationMessage): MaybePromise<void>;
  clearMessages?(input: { chatId: string; userId?: string }): MaybePromise<void>;
  getWorkingMemory?(input: {
    chatId: string;
    userId?: string;
    scope: "chat";
  }): MaybePromise<AiSdkWorkingMemory | null>;
  updateWorkingMemory?(input: {
    chatId: string;
    userId?: string;
    scope: "chat";
    content: string;
  }): MaybePromise<void>;
}

export interface CreateAiSdkConversationStoresInput {
  readonly provider: AiSdkMemoryProvider;
  readonly userId?: string;
  readonly onProjectionIssue?: (issue: ConversationProjectionIssue) => void;
}

export interface ConversationProjectionIssue {
  readonly code: "unsupported-native-message-content";
  readonly messageIndex: number;
}

const readNativeText = (content: AiSdkConversationMessage["content"]): string | null => {
  if (typeof content === "string") {
    return content;
  }
  if (
    content.length === 0 ||
    !content.every(
      (part) =>
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        ((part as { type?: unknown }).type === "text" ||
          (part as { type?: unknown }).type === "reasoning") &&
        "text" in part &&
        typeof (part as { text?: unknown }).text === "string",
    )
  ) {
    return null;
  }
  return content.map((part) => (part as { text: string }).text).join("");
};

const toTurn = (message: AiSdkConversationMessage): ConversationTurn | null => {
  const text = readNativeText(message.content);
  if (text === null) {
    return null;
  }
  return registerConversationTurn({
    role: message.role,
    content: [{ kind: "text", text }],
    ...(message.timestamp ? { occurredAt: message.timestamp.toISOString() } : {}),
  });
};

const readText = (turn: ConversationTurn): string | null => {
  if (!turn.content.every((part) => part.kind === "text" || part.kind === "reasoning")) {
    return null;
  }
  const text = turn.content
    .filter(
      (part): part is Extract<(typeof turn.content)[number], { kind: "text" | "reasoning" }> =>
        part.kind === "text" || part.kind === "reasoning",
    )
    .map((part) => part.text)
    .join("");
  return text.length > 0 ? text : null;
};

const toJsonState = (memory: AiSdkWorkingMemory | null): JsonValue | null =>
  memory
    ? {
        workingMemory: memory.content,
        ...(memory.updatedAt ? { workingMemoryUpdatedAt: memory.updatedAt.toISOString() } : {}),
      }
    : null;

export const createAiSdkConversationStores = ({
  provider,
  userId,
  onProjectionIssue,
}: CreateAiSdkConversationStoresInput): {
  readonly conversations: ConversationStore;
  readonly state: ConversationStateStore;
} => {
  const conversations: ConversationStore = {
    read: (_context, conversationId) => {
      if (!provider.getMessages) {
        return null;
      }
      return maybeMap(
        (messages): ConversationRecord => {
          const turns = messages.flatMap((message, messageIndex) => {
            const turn = toTurn(message);
            if (turn) {
              return [turn];
            }
            onProjectionIssue?.({
              code: "unsupported-native-message-content",
              messageIndex,
            });
            return [];
          });
          return registerConversationRecord({
            conversationId,
            turns,
            revision: messages.length,
          });
        },
        provider.getMessages({ chatId: conversationId, userId }),
      );
    },
    append: (_context, conversationId, turn) => {
      if (!provider.saveMessage) {
        return null;
      }
      const registered = registerConversationTurn(turn);
      const content = readText(registered);
      if (content === null) {
        return false;
      }
      return maybeMap(
        () => true,
        provider.saveMessage({
          chatId: conversationId,
          userId,
          role: registered.role === "tool" ? "assistant" : registered.role,
          content,
          ...(registered.occurredAt ? { timestamp: new Date(registered.occurredAt) } : {}),
        }),
      );
    },
    reset: (_context, conversationId) =>
      provider.clearMessages
        ? maybeMap(() => true, provider.clearMessages({ chatId: conversationId, userId }))
        : null,
  };

  const state: ConversationStateStore = {
    load: (_context, conversationId) =>
      provider.getWorkingMemory
        ? maybeMap(
            toJsonState,
            provider.getWorkingMemory({ chatId: conversationId, userId, scope: "chat" }),
          )
        : null,
    save: (_context, conversationId, { output }) => {
      if (!provider.updateWorkingMemory) {
        return null;
      }
      const content = output.workingMemory;
      if (typeof content !== "string" || !isJsonValue(output)) {
        return false;
      }
      return maybeMap(
        () => true,
        provider.updateWorkingMemory({
          chatId: conversationId,
          userId,
          scope: "chat",
          content,
        }),
      );
    },
  };

  return Object.freeze({
    conversations: Object.freeze(conversations),
    state: Object.freeze(state),
  });
};
