import { describe, expect, test } from "bun:test";
import { createAiSdkConversationStores } from "../../src/adapters/providers/ai-sdk/storage";
import { createLangChainConversationStateStore } from "../../src/adapters/frameworks/langchain/storage";
import { createLlamaIndexConversationStore } from "../../src/adapters/frameworks/llamaindex/storage";
import { registerConversationTurn } from "../../src/features/memory/public";
import { context, conversationId } from "../storage/helpers";

describe("qualified conversation adapters", () => {
  test("maps AI SDK messages and working memory with closed redaction", async () => {
    let savedMessage: unknown;
    let savedWorkingMemory: unknown;
    const stores = createAiSdkConversationStores({
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

    const record = await stores.conversations.read(context, conversationId);
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
      await stores.conversations.append(
        context,
        conversationId,
        registerConversationTurn({
          role: "assistant",
          content: [{ kind: "text", text: "ok" }],
          occurredAt: "2026-07-29T10:32:00.000Z",
        }),
      ),
    ).toBe(true);
    expect(savedMessage).toEqual({
      chatId: conversationId,
      userId: "user-1",
      role: "assistant",
      content: "ok",
      timestamp: new Date("2026-07-29T10:32:00.000Z"),
    });

    expect(await stores.state.load(context, conversationId, {})).toEqual({
      workingMemory: "facts",
      workingMemoryUpdatedAt: "2026-07-29T10:31:00.000Z",
    });
    expect(
      await stores.state.save(context, conversationId, {
        input: {},
        output: { workingMemory: "updated" },
      }),
    ).toBe(true);
    expect(savedWorkingMemory).toEqual({
      chatId: conversationId,
      userId: "user-1",
      scope: "chat",
      content: "updated",
    });
  });

  test("fails closed when AI SDK capabilities or text projection are unavailable", () => {
    const stores = createAiSdkConversationStores({ provider: {} });
    expect(stores.conversations.read(context, conversationId)).toBeNull();
    expect(
      stores.conversations.append(
        context,
        conversationId,
        registerConversationTurn({
          role: "assistant",
          content: [{ kind: "json", value: { no: "text" } }],
        }),
      ),
    ).toBeNull();
    expect(stores.state.load(context, conversationId, {})).toBeNull();

    const writeOnly = createAiSdkConversationStores({
      provider: { saveMessage: () => undefined },
    });
    expect(
      writeOnly.conversations.append(
        context,
        conversationId,
        registerConversationTurn({
          role: "assistant",
          content: [{ kind: "json", value: { no: "text" } }],
        }),
      ),
    ).toBe(false);
  });

  test("omits mixed and binary-only AI SDK turns with safe projection issues", async () => {
    const issues: Array<{ code: string; messageIndex: number }> = [];
    const stores = createAiSdkConversationStores({
      onProjectionIssue: (issue) => issues.push(issue),
      provider: {
        getMessages: () => [
          {
            role: "assistant",
            content: [
              { type: "reasoning", text: "think " },
              { type: "text", text: "answer" },
            ],
          },
          {
            role: "user",
            content: [
              { type: "text", text: "caption" },
              { type: "image", data: "raw" },
            ],
          },
          {
            role: "user",
            content: [{ type: "file", data: new Uint8Array([1]) }],
          },
        ],
      },
    });

    const record = await stores.conversations.read(context, conversationId);
    expect(record?.revision).toBe(3);
    expect(record?.turns).toEqual([
      { role: "assistant", content: [{ kind: "text", text: "think answer" }] },
    ]);
    expect(issues).toEqual([
      { code: "unsupported-native-message-content", messageIndex: 1 },
      { code: "unsupported-native-message-content", messageIndex: 2 },
    ]);
    expect(JSON.stringify(record)).not.toContain("raw");
  });

  test("maps LangChain JSON state and rejects non-portable provider output", async () => {
    const valid = createLangChainConversationStateStore({
      loadMemoryVariables: () => Promise.resolve({ history: ["hello"] }),
      saveContext: () => Promise.resolve(),
    });
    await expect(valid.load(context, conversationId, {})).resolves.toEqual({
      history: ["hello"],
    });
    await expect(
      valid.save(context, conversationId, {
        input: { input: "hello" },
        output: { output: "ok" },
      }),
    ).resolves.toBe(true);

    const invalid = createLangChainConversationStateStore({
      loadMemoryVariables: () => ({ unsafe: new Uint8Array([1]) }),
      saveContext: () => undefined,
    });
    expect(invalid.load(context, conversationId, {})).toBeNull();
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
                { type: "image", data: "raw" },
              ],
            },
          ]),
        add: (message) => void saved.push(message),
        clear: () => {
          cleared = true;
        },
      },
    });

    await expect(store.read(context, conversationId)).resolves.toEqual({
      conversationId,
      revision: 4,
      turns: [
        { role: "system", content: [{ kind: "text", text: "note" }] },
        { role: "system", content: [{ kind: "text", text: "memo" }] },
        { role: "user", content: [{ kind: "text", text: "native" }] },
      ],
    });
    expect(issues).toEqual([{ code: "unsupported-native-message-content", messageIndex: 3 }]);
    expect(
      await store.append(
        context,
        conversationId,
        registerConversationTurn({
          role: "tool",
          content: [{ kind: "text", text: "result" }],
        }),
      ),
    ).toBe(true);
    expect(saved).toEqual([{ role: "assistant", content: "result" }]);
    expect(await store.reset(context, conversationId)).toBe(true);
    expect(cleared).toBe(true);
  });
});
