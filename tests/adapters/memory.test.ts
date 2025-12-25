import { describe, expect, it } from "bun:test";
import { fromAiSdkMemory, fromLangChainMemory, fromLlamaIndexMemory } from "#adapters";
import {
  asAiSdkMemoryProvider,
  asLangChainMemory,
  asLlamaIndexMemory,
  captureDiagnostics,
} from "./helpers";

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

  it("maps AI SDK memory providers", async () => {
    let savedMessage: unknown;
    let savedWorkingMemory: unknown;

    const provider = asAiSdkMemoryProvider({
      getMessages: () =>
        Promise.resolve([
          {
            chatId: "thread-1",
            role: "user",
            content: "hello",
            timestamp: new Date(1234),
          },
        ]),
      saveMessage: (message: unknown) => {
        savedMessage = message;
        return Promise.resolve();
      },
      getWorkingMemory: () =>
        Promise.resolve({
          content: "facts",
          updatedAt: new Date(555),
        }),
      updateWorkingMemory: (payload: unknown) => {
        savedWorkingMemory = payload;
        return Promise.resolve();
      },
    });

    const adapter = fromAiSdkMemory(provider, { scope: "chat", userId: "user-1" });
    const thread = await adapter.read?.("thread-1");
    expect(thread).toEqual({
      id: "thread-1",
      turns: [{ role: "user", content: "hello", timestamp: 1234 }],
    });

    await expect(
      adapter.append?.("thread-1", { role: "assistant", content: "ok", timestamp: 999 }),
    ).resolves.toBeUndefined();
    expect(savedMessage).toEqual({
      chatId: "thread-1",
      userId: "user-1",
      role: "assistant",
      content: "ok",
      timestamp: new Date(999),
    });

    const loaded = await adapter.load?.({ threadId: "thread-1" });
    expect(loaded).toEqual({
      workingMemory: "facts",
      workingMemoryUpdatedAt: new Date(555),
    });

    await expect(
      adapter.save?.({ threadId: "thread-1" }, { workingMemory: "updated" }),
    ).resolves.toBeUndefined();
    expect(savedWorkingMemory).toEqual({
      chatId: "thread-1",
      userId: "user-1",
      scope: "chat",
      content: "updated",
    });
  });

  it("warns when AI SDK thread ids are missing", async () => {
    const provider = asAiSdkMemoryProvider({
      getMessages: () => Promise.resolve([]),
      saveMessage: () => Promise.resolve(),
      getWorkingMemory: () => Promise.resolve(null),
      updateWorkingMemory: () => Promise.resolve(),
    });
    const adapter = fromAiSdkMemory(provider);
    const { context, diagnostics } = captureDiagnostics();

    const thread = await adapter.read?.("", context);
    expect(thread).toBeUndefined();

    await adapter.append?.("", { role: "user", content: "hi" }, context);
    await adapter.load?.(undefined as never, context);
    await adapter.save?.(undefined as never, undefined as never, context);

    expect(diagnostics.map((entry) => entry.message)).toContain("memory_thread_missing");
    expect(diagnostics.map((entry) => entry.message)).toContain("memory_input_missing");
    expect(diagnostics.map((entry) => entry.message)).toContain("memory_output_missing");
  });

  it("warns when AI SDK provider methods are missing", async () => {
    const provider = asAiSdkMemoryProvider({});
    const adapter = fromAiSdkMemory(provider);
    const { context, diagnostics } = captureDiagnostics();

    await adapter.read?.("thread-1", context);
    await adapter.append?.("thread-1", { role: "user", content: "hi" }, context);
    await adapter.load?.({ threadId: "thread-1" }, context);
    await adapter.save?.({ threadId: "thread-1" }, { workingMemory: "" }, context);

    const missing = diagnostics.filter((entry) => entry.message === "memory_provider_missing");
    expect(missing).toHaveLength(4);
  });
});
