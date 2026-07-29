import type { JsonValue } from "#contracts";
import { maybeMap, type MaybePromise } from "#shared/maybe";
import {
  registerConversationRecord,
  registerConversationTurn,
  type ConversationRecord,
  type ConversationStateStore,
  type ConversationStore,
  type ConversationTurn,
} from "../../../../features/memory/public";
import {
  isPortableJsonValue,
  registerPortableJsonObject,
  registerPortableJsonValue,
} from "../../../../features/storage/public";

/**
 * Structural host message contract. AI SDK 7 does not publish a conversation
 * memory provider, so this adapter intentionally makes no AI SDK claim.
 */
export interface HostConversationMessage {
  readonly chatId?: string;
  readonly userId?: string;
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string | readonly unknown[];
  readonly timestamp: Date;
  readonly metadata?: unknown;
}

export interface HostWorkingMemory {
  readonly content: string;
  readonly updatedAt: Date;
  readonly metadata?: unknown;
}

export interface HostConversationProvider {
  getMessages?(input: { chatId: string; userId?: string }): MaybePromise<HostConversationMessage[]>;
  saveMessage?(message: HostConversationMessage): MaybePromise<void>;
  clearMessages?(input: { chatId: string; userId?: string }): MaybePromise<void>;
  getWorkingMemory?(input: {
    chatId: string;
    userId?: string;
    scope: "chat";
  }): MaybePromise<HostWorkingMemory | null>;
  updateWorkingMemory?(input: {
    chatId: string;
    userId?: string;
    scope: "chat";
    content: string;
  }): MaybePromise<void>;
}

export interface CreateHostConversationStoresInput {
  readonly provider: HostConversationProvider;
  readonly userId?: string;
  readonly now?: () => Date;
  readonly onProjectionIssue?: (issue: HostConversationProjectionIssue) => void;
}

export interface HostConversationProjectionIssue {
  readonly code: "unsupported-native-message-content";
  readonly messageIndex: number;
}

const readNativeText = (content: HostConversationMessage["content"]): string | null => {
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

const toTurn = (message: HostConversationMessage): ConversationTurn | null => {
  const text = readNativeText(message.content);
  if (
    text === null ||
    !(message.timestamp instanceof Date) ||
    Number.isNaN(message.timestamp.getTime())
  ) {
    return null;
  }
  return registerConversationTurn({
    role: message.role,
    content: [{ kind: "text", text }],
    occurredAt: message.timestamp.toISOString(),
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

const safeNotify = (
  notify: CreateHostConversationStoresInput["onProjectionIssue"],
  issue: HostConversationProjectionIssue,
) => {
  try {
    notify?.(issue);
  } catch {
    // Diagnostics cannot replace the safe null outcome.
  }
};

const projectMessages = (
  conversationId: Parameters<ConversationStore["read"]>[1],
  messages: HostConversationMessage[],
  notify: CreateHostConversationStoresInput["onProjectionIssue"],
): ConversationRecord | null => {
  const turns: ConversationTurn[] = [];
  let failed = false;
  messages.forEach((message, messageIndex) => {
    const turn = toTurn(message);
    if (turn) {
      turns.push(turn);
      return;
    }
    failed = true;
    safeNotify(notify, {
      code: "unsupported-native-message-content",
      messageIndex,
    });
  });
  return failed
    ? null
    : registerConversationRecord({
        conversationId,
        turns,
        revision: messages.length,
      });
};

const toJsonState = (memory: HostWorkingMemory | null): JsonValue | null => {
  if (!memory || !(memory.updatedAt instanceof Date) || Number.isNaN(memory.updatedAt.getTime())) {
    return null;
  }
  const candidate = {
    workingMemory: memory.content,
    workingMemoryUpdatedAt: memory.updatedAt.toISOString(),
  };
  return isPortableJsonValue(candidate) ? registerPortableJsonValue(candidate) : null;
};

export const createHostConversationStores = ({
  provider,
  userId,
  now = () => new Date(),
  onProjectionIssue,
}: CreateHostConversationStoresInput): {
  readonly conversations: ConversationStore;
  readonly state: ConversationStateStore;
} => {
  const conversations: ConversationStore = {
    read: (_context, conversationId) => {
      if (!provider.getMessages) {
        return null;
      }
      return maybeMap(
        (messages) => projectMessages(conversationId, messages, onProjectionIssue),
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
      const timestamp = registered.occurredAt ? new Date(registered.occurredAt) : now();
      if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
        return false;
      }
      return maybeMap(
        () => true,
        provider.saveMessage({
          chatId: conversationId,
          userId,
          role: registered.role === "tool" ? "assistant" : registered.role,
          content,
          timestamp,
        }),
      );
    },
    reset: (_context, conversationId) =>
      provider.clearMessages
        ? maybeMap(() => true, provider.clearMessages({ chatId: conversationId, userId }))
        : null,
  };

  const state: ConversationStateStore = {
    load: (_context, conversationId, input) => {
      registerPortableJsonObject(input);
      return provider.getWorkingMemory
        ? maybeMap(
            toJsonState,
            provider.getWorkingMemory({ chatId: conversationId, userId, scope: "chat" }),
          )
        : null;
    },
    save: (_context, conversationId, { input, output }) => {
      if (!provider.updateWorkingMemory) {
        return null;
      }
      registerPortableJsonObject(input);
      const registeredOutput = registerPortableJsonObject(output);
      const content = registeredOutput.workingMemory;
      if (typeof content !== "string") {
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
