import type { Memory as LlamaIndexMemory } from "@llamaindex/core/memory";
import type { ChatMessage, MessageType } from "@llamaindex/core/llms";
import type { AdapterCallContext, Memory, Turn } from "../types";
import { maybeMap, toTrue } from "../../maybe";
import { reportDiagnostics, validateMemoryTurn, validateThreadId } from "../input-validation";

type TurnRole = Turn["role"];

const toTurnRole = (role: MessageType): TurnRole => {
  if (role === "developer" || role === "memory") {
    return "system";
  }
  return role;
};

const toContent = (content: ChatMessage["content"]) => (typeof content === "string" ? content : "");

export function fromLlamaIndexMemory(memory: LlamaIndexMemory): Memory {
  function read(threadId: string, context?: AdapterCallContext) {
    const diagnostics = validateThreadId(threadId, "read");
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return undefined;
    }
    return maybeMap(
      (messages) => ({
        id: "default",
        turns: messages.map((message) => ({
          role: toTurnRole(message.role),
          content: toContent(message.content),
        })),
      }),
      memory.getLLM(),
    );
  }

  function append(threadId: string, turn: Turn, context?: AdapterCallContext) {
    const diagnostics = validateThreadId(threadId, "append").concat(validateMemoryTurn(turn));
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return false;
    }
    return maybeMap(toTrue, memory.add({ role: turn.role, content: turn.content }));
  }

  function reset(context?: AdapterCallContext) {
    void context;
    return maybeMap(toTrue, memory.clear());
  }

  return { read, append, reset };
}
