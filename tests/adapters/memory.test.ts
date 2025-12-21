import { describe, expect, it } from "bun:test";
import type { BaseMemory } from "@langchain/core/memory";
import type { Memory as LlamaMemory } from "@llamaindex/core/memory";
import { fromLangChainMemory, fromLlamaIndexMemory } from "#adapters";

describe("Adapter memory", () => {
  it("maps LangChain memory", async () => {
    const memory = {
      loadMemoryVariables: () => Promise.resolve({ history: [] }),
      saveContext: () => Promise.resolve(),
      memoryKeys: ["history"],
    } as unknown as BaseMemory;

    const adapter = fromLangChainMemory(memory);
    const loaded = await adapter.load?.({ input: "hi" });
    expect(loaded).toEqual({ history: [] });
    await expect(adapter.save?.({ input: "hi" }, { output: "ok" })).resolves.toBeUndefined();
  });

  it("maps LlamaIndex memory", async () => {
    const memory = {
      getLLM: () =>
        Promise.resolve([
          { role: "developer", content: "note" },
          { role: "memory", content: "memo" },
          { role: "user", content: [{ type: "text", text: "hi" }] },
        ]),
      add: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    } as unknown as LlamaMemory;

    const adapter = fromLlamaIndexMemory(memory);
    const thread = await adapter.read?.("thread");
    expect(thread?.turns).toEqual([
      { role: "system", content: "note" },
      { role: "system", content: "memo" },
      { role: "user", content: "" },
    ]);
    await expect(
      adapter.append?.("thread", { role: "user", content: "hi" }),
    ).resolves.toBeUndefined();
    await expect(adapter.reset?.()).resolves.toBeUndefined();
  });
});
