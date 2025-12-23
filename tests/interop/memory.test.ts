import { describe, expect, it } from "bun:test";
import type { BaseMemory as LangChainMemory } from "@langchain/core/memory";
import type { Memory as LlamaMemory } from "@llamaindex/core/memory";
import * as AiSdk from "ai";
import type { Memory } from "#workflow";
import { mapMaybe } from "./helpers";

const toMemoryFromLangChain = (memory: LangChainMemory): Memory => ({
  load: (input) => mapMaybe(memory.loadMemoryVariables(input), (value) => value),
  save: (input, output) => mapMaybe(memory.saveContext(input, output), () => undefined),
});

const toMemoryFromLlama = (memory: LlamaMemory): Memory => ({
  read: (threadId) => {
    void threadId;
    return mapMaybe(memory.getLLM(), (messages) => ({
      id: "default",
      turns: messages.map((message) => ({
        role: message.role === "memory" || message.role === "developer" ? "system" : message.role,
        content: typeof message.content === "string" ? message.content : "",
      })),
    }));
  },
  append: (_threadId, turn) => {
    void _threadId;
    const role = turn.role === "tool" ? "assistant" : turn.role;
    return memory.add({ role, content: turn.content });
  },
  reset: () => memory.clear(),
});

describe("Interop memory", () => {
  it("maps LangChain memory to Memory", () => {
    const memory = {
      memoryKeys: ["history"],
      loadMemoryVariables: () => Promise.resolve({ history: [] }),
      saveContext: () => Promise.resolve(),
    } as unknown as LangChainMemory;

    const adapted = toMemoryFromLangChain(memory);
    expect(adapted.load).toBeFunction();
    expect(adapted.save).toBeFunction();
  });

  it("maps LlamaIndex memory to Memory", () => {
    const memory = {
      get: () => Promise.resolve([]),
      getLLM: () => Promise.resolve([]),
      add: () => Promise.resolve(),
      clear: () => Promise.resolve(),
      snapshot: () => "",
    } as unknown as LlamaMemory;

    const adapted = toMemoryFromLlama(memory);
    expect(adapted.read).toBeFunction();
    expect(adapted.reset).toBeFunction();
  });

  it("notes AI SDK has no memory abstraction", () => {
    expect("Memory" in AiSdk).toBe(false);
  });
});
