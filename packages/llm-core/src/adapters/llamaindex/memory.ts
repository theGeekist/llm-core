import type { Memory as LlamaIndexMemory } from "@llamaindex/core/memory";
import type { ChatMessage, MessageType } from "@llamaindex/core/llms";
import type { AdapterRequest, Memory, Turn } from "../types";
import { toTrue } from "#shared/fp";
import { maybeMap } from "#shared/maybe";
import { reportDiagnostics, validateMemoryTurn, validateThreadId } from "../input-validation";

type TurnRole = Turn["role"];

const toTurnRole = (role: MessageType): TurnRole => {
  if (role === "developer" || role === "memory") {
    return "system";
  }
  return role;
};

const toContent = (content: ChatMessage["content"]) => (typeof content === "string" ? content : "");

const toTurnFromMessage = (message: ChatMessage): Turn => ({
  role: toTurnRole(message.role),
  content: toContent(message.content),
});

const toThreadFromMessages = (messages: ChatMessage[]) => ({
  id: "default",
  turns: messages.map(toTurnFromMessage),
});

export function fromLlamaIndexMemory(memory: LlamaIndexMemory): Memory {
  function read({ threadId, context }: AdapterRequest<{ threadId: string }>) {
    const diagnostics = validateThreadId(threadId, "read");
    if (reportDiagnostics(context, diagnostics)) {
      return null;
    }
    return maybeMap(toThreadFromMessages, memory.getLLM());
  }

  function append({ threadId, turn, context }: AdapterRequest<{ threadId: string; turn: Turn }>) {
    const diagnostics = validateThreadId(threadId, "append").concat(validateMemoryTurn(turn));
    if (reportDiagnostics(context, diagnostics)) {
      return false;
    }
    return maybeMap(toTrue, memory.add({ role: turn.role, content: turn.content }));
  }

  function reset(_request: AdapterRequest) {
    return maybeMap(toTrue, memory.clear());
  }

  return { read, append, reset };
}
