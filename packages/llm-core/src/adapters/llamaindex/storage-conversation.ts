import { maybeMap } from "#shared/maybe";
import {
  registerConversationRecord,
  createConversationMessage,
  type ConversationStore,
  type ConversationMessage,
} from "../../features/memory/public";
import type { LlamaIndexChatMessage, LlamaIndexMemory } from "./storage-types";

export interface LlamaIndexConversationProjectionIssue {
  readonly code: "unsupported-native-message-content";
  readonly messageIndex: number;
}

export interface CreateLlamaIndexConversationStoreInput {
  readonly memory: LlamaIndexMemory;
  readonly onProjectionIssue?: (issue: LlamaIndexConversationProjectionIssue) => void;
}

const toRole = (role: LlamaIndexChatMessage["role"]): ConversationMessage["role"] =>
  role === "developer" || role === "memory" ? "system" : role;

const readNativeText = (content: LlamaIndexChatMessage["content"]): string | null => {
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

const toTurn = (message: LlamaIndexChatMessage): ConversationMessage | null => {
  const text = readNativeText(message.content);
  if (text === null) {
    return null;
  }
  return createConversationMessage({
    role: toRole(message.role),
    content: [{ kind: "text", text }],
  });
};

const readText = (turn: ConversationMessage): string | null => {
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
  notify: CreateLlamaIndexConversationStoreInput["onProjectionIssue"],
  issue: LlamaIndexConversationProjectionIssue,
) => {
  try {
    notify?.(issue);
  } catch {
    // Diagnostics cannot replace the safe null outcome.
  }
};

export const createLlamaIndexConversationStore = (
  input: CreateLlamaIndexConversationStoreInput,
): ConversationStore => {
  const { memory, onProjectionIssue } = input;
  const adapter: ConversationStore = {
    read: ({ conversationId }) =>
      maybeMap((messages) => {
        const turns: ConversationMessage[] = [];
        let failed = false;
        messages.forEach((message, messageIndex) => {
          const turn = toTurn(message);
          if (turn) {
            turns.push(turn);
            return;
          }
          failed = true;
          safeNotify(onProjectionIssue, {
            code: "unsupported-native-message-content",
            messageIndex,
          });
        });
        if (failed) {
          return null;
        }
        return registerConversationRecord({
          conversationId,
          turns,
          revision: messages.length,
        });
      }, memory.getLLM()),
    append: ({ turn }) => {
      const registered = createConversationMessage(turn);
      const content = readText(registered);
      if (content === null) {
        return false;
      }
      return maybeMap(
        () => true,
        memory.add({
          role: registered.role === "tool" ? "assistant" : registered.role,
          content,
        }),
      );
    },
    reset: () => maybeMap(() => true, memory.clear()),
  };
  return Object.freeze(adapter);
};
