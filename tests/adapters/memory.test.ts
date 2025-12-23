import { describe, expect, it } from "bun:test";
import { fromLangChainMemory, fromLlamaIndexMemory } from "#adapters";
import { asLangChainMemory, asLlamaIndexMemory, captureDiagnostics } from "./helpers";

describe("Adapter memory", () => {
  it("maps LangChain memory", async () => {
    const memory = asLangChainMemory({
      loadMemoryVariables: () => Promise.resolve({ history: [] }),
      saveContext: () => Promise.resolve(),
      memoryKeys: ["history"],
    });

    const adapter = fromLangChainMemory(memory);
    const loaded = await adapter.load?.({ input: "hi" });
    expect(loaded).toEqual({ history: [] });
    await expect(adapter.save?.({ input: "hi" }, { output: "ok" })).resolves.toBeUndefined();
  });

  it("maps LlamaIndex memory", async () => {
    const memory = asLlamaIndexMemory({
      getLLM: () =>
        Promise.resolve([
          { role: "developer", content: "note" },
          { role: "memory", content: "memo" },
          { role: "user", content: [{ type: "text", text: "hi" }] },
        ]),
      add: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    });

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

  it("warns when memory thread id is missing", async () => {
    const memory = asLlamaIndexMemory({
      getLLM: () => Promise.resolve([]),
      add: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    });
    const adapter = fromLlamaIndexMemory(memory);
    const { context, diagnostics } = captureDiagnostics();

    const thread = await adapter.read?.("", context);
    expect(thread).toBeUndefined();
    expect(diagnostics[0]?.message).toBe("memory_thread_missing");
  });

  it("warns when LangChain memory inputs are missing", async () => {
    const memory = asLangChainMemory({
      loadMemoryVariables: () => Promise.resolve({}),
      saveContext: () => Promise.resolve(),
      memoryKeys: ["history"],
    });
    const adapter = fromLangChainMemory(memory);
    const { context, diagnostics } = captureDiagnostics();

    const missingInput = undefined as never;
    await adapter.load?.(missingInput, context);
    await adapter.save?.(missingInput, { output: "ok" }, context);
    await adapter.save?.({ input: "ok" }, undefined as never, context);

    const messages = diagnostics.map((entry) => entry.message);
    expect(messages).toContain("memory_input_missing");
    expect(messages).toContain("memory_output_missing");
  });
});
