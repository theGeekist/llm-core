import { maybeMap } from "#shared/maybe";
import type { ConversationStateStore } from "../../../../features/memory/public";
import {
  isPortableJsonValue,
  registerPortableJsonObject,
  registerPortableJsonValue,
} from "../../../../features/storage/public";
import type { LangChainMemory } from "./types";

export const createLangChainConversationStateStore = (
  memory: LangChainMemory,
): ConversationStateStore => {
  const adapter: ConversationStateStore = {
    load: ({ input }) => {
      const nativeInput = structuredClone(registerPortableJsonObject(input));
      return maybeMap(
        (value) => (isPortableJsonValue(value) ? registerPortableJsonValue(value) : null),
        memory.loadMemoryVariables(nativeInput),
      );
    },
    save: ({ state: { input, output } }) => {
      const nativeInput = structuredClone(registerPortableJsonObject(input));
      const nativeOutput = structuredClone(registerPortableJsonObject(output));
      return maybeMap(() => true, memory.saveContext(nativeInput, nativeOutput));
    },
  };
  return Object.freeze(adapter);
};
