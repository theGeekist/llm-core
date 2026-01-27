import { describe, expect, it } from "bun:test";
import type { BaseMemory as LangChainMemory } from "@langchain/core/memory";
import type { Memory as LlamaMemory } from "@llamaindex/core/memory";
import * as AiSdk from "ai";
import * as AiSdkMemory from "@ai-sdk-tools/memory";
import type { Memory } from "#workflow";
import { identity } from "../../src/shared/fp";
import { maybeMap } from "../../src/shared/maybe";
import { toNull } from "../../src/shared/fp";

const toMemoryFromLangChain = (memory: LangChainMemory): Memory => ({
  load: (input) => maybeMap(identity, memory.loadMemoryVariables(input)),
  save: (input, output) => maybeMap(toNull, memory.saveContext(input, output)),
});

const toMemoryFromLlama = (memory: LlamaMemory): Memory => ({
  read: (threadId) => {
    void threadId;
    return maybeMap(
      (messages) => ({
        id: "default",
        turns: messages.map((message) => ({
          role: message.role === "memory" || message.role === "developer" ? "system" : message.role,
          content: typeof message.content === "string" ? message.content : "",
        })),
      }),
      memory.getLLM(),
    );
  },
  append: (_threadId, turn) => {
    void _threadId;
    const role = turn.role === "tool" ? "assistant" : turn.role;
    return maybeMap(toNull, memory.add({ role, content: turn.content }));
  },
  reset: () => maybeMap(toNull, memory.clear()),
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

  it("notes AI SDK memory lives in tools packages", () => {
    expect("Memory" in AiSdk).toBe(false);
    expect("formatWorkingMemory" in AiSdkMemory).toBe(true);
  });
});
