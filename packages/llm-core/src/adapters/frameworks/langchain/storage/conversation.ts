import { isJsonValue } from "#contracts";
import { maybeMap } from "#shared/maybe";
import type { ConversationStateStore } from "../../../../features/memory/public";
import type { LangChainMemory } from "./types";

export const createLangChainConversationStateStore = (
  memory: LangChainMemory,
): ConversationStateStore => {
  const adapter: ConversationStateStore = {
    load: (_context, _conversationId, input) =>
      maybeMap((value) => (isJsonValue(value) ? value : null), memory.loadMemoryVariables(input)),
    save: (_context, _conversationId, { input, output }) =>
      maybeMap(() => true, memory.saveContext(input, output)),
  };
  return Object.freeze(adapter);
};
