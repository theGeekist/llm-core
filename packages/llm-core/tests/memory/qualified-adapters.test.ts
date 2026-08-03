import { describe, expect, test } from "bun:test";
import { createHostConversationStores } from "../../src/adapters/ai-sdk/storage-conversation";
import { createLangChainConversationStateStore } from "../../src/adapters/langchain/public";
import { createLlamaIndexConversationStore } from "../../src/adapters/llamaindex/public";
import { createConversationMessage } from "../../src/features/memory/public";
import { context, conversationId } from "../storage/storage-fixtures";

describe("qualified conversation adapters", () => {
  test("maps host messages and working memory with closed redaction", async () => {
    let savedMessage: unknown;
    let savedWorkingMemory: unknown;
    const stores = createHostConversationStores({
      userId: "user-1",
      provider: {
        getMessages: () =>
          Promise.resolve([
            {
              chatId: conversationId,
              role: "user",
              content: "hello",
              timestamp: new Date("2026-07-29T10:30:00.000Z"),
              metadata: { signedUrl: "https://secret", credential: "raw" },
            },
          ]),
        saveMessage: (message) => {
          savedMessage = message;
        },
        clearMessages: () => undefined,
        getWorkingMemory: () =>
          Promise.resolve({
            content: "facts",
            updatedAt: new Date("2026-07-29T10:31:00.000Z"),
            metadata: { credential: "raw" },
          }),
        updateWorkingMemory: (memory) => {
          savedWorkingMemory = memory;
        },
      },
    });

    const record = await stores.conversations.read({ context, conversationId });
    expect(record).toEqual({
      conversationId,
      revision: 1,
      turns: [
        {
          role: "user",
          content: [{ kind: "text", text: "hello" }],
          occurredAt: "2026-07-29T10:30:00.000Z",
        },
      ],
    });
    expect(JSON.stringify(record)).not.toContain("credential");
    expect(JSON.stringify(record)).not.toContain("signedUrl");

    expect(
      await stores.conversations.append({
        context,
        conversationId,
        turn: createConversationMessage({
          role: "assistant",
          content: [{ kind: "text", text: "ok" }],
          occurredAt: "2026-07-29T10:32:00.000Z",
        }),
      }),
    ).toBe(true);
    expect(savedMessage).toEqual({
      chatId: conversationId,
      userId: "user-1",
      role: "assistant",
      content: "ok",
      timestamp: new Date("2026-07-29T10:32:00.000Z"),
    });

    expect(await stores.state.load({ context, conversationId, input: {} })).toEqual({
      workingMemory: "facts",
      workingMemoryUpdatedAt: "2026-07-29T10:31:00.000Z",
    });
    expect(
      await stores.state.save({
        context,
        conversationId,
        state: {
          input: {},
          output: { workingMemory: "updated" },
        },
      }),
    ).toBe(true);
    expect(savedWorkingMemory).toEqual({
      chatId: conversationId,
      userId: "user-1",
      scope: "chat",
      content: "updated",
    });
  });

  test("fails closed when host capabilities or text projection are unavailable", () => {
    const stores = createHostConversationStores({ provider: {} });
    expect(stores.conversations.read({ context, conversationId })).toBeNull();
    expect(
      stores.conversations.append({
        context,
        conversationId,
        turn: createConversationMessage({
          role: "assistant",
          content: [{ kind: "json", value: { no: "text" } }],
        }),
      }),
    ).toBeNull();
    expect(stores.state.load({ context, conversationId, input: {} })).toBeNull();

    const writeOnly = createHostConversationStores({
      provider: { saveMessage: () => undefined },
    });
    expect(
      writeOnly.conversations.append({
        context,
        conversationId,
        turn: createConversationMessage({
          role: "assistant",
          content: [{ kind: "json", value: { no: "text" } }],
        }),
      }),
    ).toBe(false);
  });

  test("atomically rejects unsupported synchronous host multipart with safe issues", () => {
    const issues: Array<{ code: string; messageIndex: number }> = [];
    const stores = createHostConversationStores({
      onProjectionIssue: (issue) => issues.push(issue),
      provider: {
        getMessages: () => [
          {
            role: "assistant",
            timestamp: new Date("2026-07-29T10:30:00.000Z"),
            content: [
              { type: "reasoning", text: "think " },
              { type: "text", text: "answer" },
            ],
          },
          {
            role: "user",
            timestamp: new Date("2026-07-29T10:31:00.000Z"),
            content: [
              { type: "text", text: "caption" },
              { type: "image", data: "raw" },
            ],
          },
          {
            role: "user",
            timestamp: new Date("2026-07-29T10:32:00.000Z"),
            content: [{ type: "file", data: new Uint8Array([1]) }],
          },
        ],
      },
    });

    const record = stores.conversations.read({ context, conversationId });
    expect(record).toBeNull();
    expect(issues).toEqual([
      { code: "unsupported-native-message-content", messageIndex: 1 },
      { code: "unsupported-native-message-content", messageIndex: 2 },
    ]);
    expect(JSON.stringify(record)).not.toContain("raw");
  });

  test("keeps async host multipart failure safe without a callback and when it throws", async () => {
    const messages = [
      {
        role: "user" as const,
        timestamp: new Date("2026-07-29T10:30:00.000Z"),
        content: [{ type: "image", data: "raw" }],
      },
    ];
    const withoutCallback = createHostConversationStores({
      provider: { getMessages: () => Promise.resolve(messages) },
    });
    await expect(
      withoutCallback.conversations.read({ context, conversationId }),
    ).resolves.toBeNull();

    const throwingCallback = createHostConversationStores({
      onProjectionIssue: () => {
        throw new Error("diagnostic failure");
      },
      provider: { getMessages: () => Promise.resolve(messages) },
    });
    await expect(
      throwingCallback.conversations.read({ context, conversationId }),
    ).resolves.toBeNull();
  });

  test("always supplies a timestamp when appending host messages", () => {
    let saved: unknown;
    const now = new Date("2026-07-29T11:00:00.000Z");
    const stores = createHostConversationStores({
      now: () => now,
      provider: {
        saveMessage: (message) => {
          saved = message;
        },
      },
    });
    expect(
      stores.conversations.append({
        context,
        conversationId,
        turn: createConversationMessage({
          role: "assistant",
          content: [{ kind: "text", text: "timestamped" }],
        }),
      }),
    ).toBe(true);
    expect(saved).toMatchObject({ timestamp: now });
  });

  test("fails closed when a host message omits its required timestamp at runtime", () => {
    const stores = createHostConversationStores({
      provider: {
        getMessages: () => [{ role: "user", content: "missing timestamp" } as never],
      },
    });
    expect(stores.conversations.read({ context, conversationId })).toBeNull();
  });

  test("clones and freezes nested LangChain JSON across sync and async boundaries", async () => {
    const loadedSource = { history: [{ text: "hello" }] };
    let savedInput: unknown;
    let savedOutput: unknown;
    const valid = createLangChainConversationStateStore({
      loadMemoryVariables: () => loadedSource,
      saveContext: async (input, output) => {
        savedInput = input;
        savedOutput = output;
      },
    });
    const loaded = valid.load({ context, conversationId, input: {} });
    expect(loaded).toEqual({ history: [{ text: "hello" }] });
    loadedSource.history[0]!.text = "mutated";
    expect(loaded).toEqual({ history: [{ text: "hello" }] });
    expect(Object.isFrozen((loaded as { history: object[] }).history[0])).toBe(true);

    const input = { nested: { value: "input" } };
    const output = { nested: { value: "output" } };
    await expect(
      valid.save({
        context,
        conversationId,
        state: { input, output },
      }),
    ).resolves.toBe(true);
    input.nested.value = "changed";
    output.nested.value = "changed";
    expect(savedInput).toEqual({ nested: { value: "input" } });
    expect(savedOutput).toEqual({ nested: { value: "output" } });

    const invalid = createLangChainConversationStateStore({
      loadMemoryVariables: () => Promise.resolve({ nested: { token: "raw" } }),
      saveContext: () => undefined,
    });
    await expect(invalid.load({ context, conversationId, input: {} })).resolves.toBeNull();
  });

  test("maps LlamaIndex conversation roles, append and reset", async () => {
    const saved: unknown[] = [];
    let cleared = false;
    const issues: Array<{ code: string; messageIndex: number }> = [];
    const store = createLlamaIndexConversationStore({
      onProjectionIssue: (issue) => issues.push(issue),
      memory: {
        getLLM: () =>
          Promise.resolve([
            { role: "developer", content: "note" },
            { role: "memory", content: "memo" },
            { role: "user", content: [{ type: "text", text: "native" }] },
            {
              role: "user",
              content: [
                { type: "text", text: "caption" },
                { type: "image", data: "raw", mimeType: "image/png" },
              ],
            },
          ]),
        add: async (message) => {
          saved.push(message);
        },
        clear: async () => {
          cleared = true;
        },
      },
    });

    await expect(store.read({ context, conversationId })).resolves.toBeNull();
    expect(issues).toEqual([{ code: "unsupported-native-message-content", messageIndex: 3 }]);
    expect(
      await store.append({
        context,
        conversationId,
        turn: createConversationMessage({
          role: "tool",
          content: [{ kind: "text", text: "result" }],
        }),
      }),
    ).toBe(true);
    expect(saved).toEqual([{ role: "assistant", content: "result" }]);
    expect(await store.reset({ context, conversationId })).toBe(true);
    expect(cleared).toBe(true);
  });
});
