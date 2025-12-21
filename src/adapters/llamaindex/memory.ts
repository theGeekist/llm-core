import type { Memory } from "@llamaindex/core/memory";
import type { ChatMessage, MessageType } from "@llamaindex/core/llms";
import type { AdapterMemory, AdapterTurn } from "../types";
import { mapMaybe } from "../maybe";

type TurnRole = AdapterTurn["role"];

const toTurnRole = (role: MessageType): TurnRole => {
  if (role === "developer" || role === "memory") {
    return "system";
  }
  return role;
};

const toContent = (content: ChatMessage["content"]) => (typeof content === "string" ? content : "");

export function fromLlamaIndexMemory(memory: Memory): AdapterMemory {
  function read(threadId: string) {
    void threadId;
    return mapMaybe(memory.getLLM(), (messages) => ({
      id: "default",
      turns: messages.map((message) => ({
        role: toTurnRole(message.role),
        content: toContent(message.content),
      })),
    }));
  }

  function append(threadId: string, turn: AdapterTurn) {
    void threadId;
    return mapMaybe(memory.add({ role: turn.role, content: turn.content }), () => undefined);
  }

  function reset() {
    return mapMaybe(memory.clear(), () => undefined);
  }

  return { read, append, reset };
}
