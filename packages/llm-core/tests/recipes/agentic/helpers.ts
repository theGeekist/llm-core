import type { Memory, Model, Tool } from "../../../src/adapters/types";

export const createAgentModel = (): Model => ({
  generate(call) {
    if (call.tools && call.tools.length > 0) {
      return {
        toolCalls: [
          {
            name: call.tools[0]?.name ?? "tool",
            arguments: { value: "ping" },
            id: "tool-1",
          },
        ],
      };
    }
    if (call.prompt && call.prompt.includes("Tool results:")) {
      return { text: "final-response" };
    }
    return { text: "plan-response" };
  },
});

export const createEchoTool = (): Tool => ({
  name: "echo",
  execute: (input) => input,
});

export const createMemoryTracker = () => {
  const calls: Array<{ type: "load" | "save"; payload: unknown }> = [];
  const memory: Memory = {
    load: (input) => {
      calls.push({ type: "load", payload: input });
      return { loaded: true };
    },
    save: (input, output) => {
      calls.push({ type: "save", payload: { input, output } });
      return null;
    },
  };
  return { memory, calls };
};
