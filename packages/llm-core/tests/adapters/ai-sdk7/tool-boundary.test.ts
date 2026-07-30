import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { newCoreId, type ConversationId, type InvocationId, type ToolCallId } from "#contracts";
import { createBuiltinModelProfile } from "../../../src/features/model/public";

const TOOL_CALL_ID = newCoreId<ToolCallId>("0190bd0c-0000-7000-8000-000000000081");
const TOOL_CALL_ID_2 = newCoreId<ToolCallId>("0190bd0c-0000-7000-8000-000000000082");
const INVOCATION_ID = newCoreId<InvocationId>("0190bd0c-0000-7000-8000-000000000083");
const INVOCATION_ID_2 = newCoreId<InvocationId>("0190bd0c-0000-7000-8000-000000000084");
const CONVERSATION_ID = newCoreId<ConversationId>("0190bd0c-0000-7000-8000-000000000085");
const CONVERSATION_ID_2 = newCoreId<ConversationId>("0190bd0c-0000-7000-8000-000000000086");

const usage = {
  inputTokens: 1,
  inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokens: 1,
  outputTokenDetails: { textTokens: 1, reasoningTokens: 0 },
  totalTokens: 2,
};

let generated: Record<string, unknown>;
let capturedGenerateOptions: Record<string, unknown> | undefined;
let createAiSdk7Model: typeof import("../../../src/adapters/providers/ai-sdk").createAiSdk7Model;
let createInMemoryAiSdk7ToolCallCorrelationStore: typeof import("../../../src/adapters/providers/ai-sdk").createInMemoryAiSdk7ToolCallCorrelationStore;

beforeAll(async () => {
  mock.module("ai", () => ({
    generateText: (options: Record<string, unknown>) => {
      capturedGenerateOptions = options;
      return generated;
    },
    streamText: () => {
      throw new Error("not used");
    },
    jsonSchema: (schema: unknown) => schema,
    tool: (definition: Record<string, unknown>) => definition,
    Output: { json: () => ({ kind: "json-output" }) },
  }));
  ({ createAiSdk7Model, createInMemoryAiSdk7ToolCallCorrelationStore } = await import(
    "../../../src/adapters/providers/ai-sdk"
  ));
});

afterAll(() => {
  mock.restore();
});

const createAdapter = (
  createToolCallId: () => ToolCallId = () => TOOL_CALL_ID,
  toolCallCorrelationStore = createInMemoryAiSdk7ToolCallCorrelationStore({ maxScopes: 32 }),
) =>
  createAiSdk7Model({
    model: "test-provider/test-model",
    profile: createBuiltinModelProfile(),
    createToolCallId,
    toolCallCorrelationStore,
  });

const setToolCallResult = (providerToolCallId = "provider-call") => {
  generated = {
    content: [
      {
        type: "tool-call",
        toolCallId: providerToolCallId,
        toolName: "lookup",
        input: { query: "safe" },
      },
    ],
    output: undefined,
    finishReason: "tool-calls",
    usage,
    response: { id: "request", modelId: "provider-model", timestamp: new Date(0) },
  };
};

describe("AI SDK 7 tool boundary", () => {
  it("preserves multipart text, JSON and binary tool results", async () => {
    const adapter = createAdapter();
    setToolCallResult();
    await adapter.generate({
      request: { messages: [{ role: "user", content: [{ kind: "text", text: "lookup" }] }] },
      context: { invocationId: INVOCATION_ID },
    });
    generated = {
      content: [{ type: "text", text: "done" }],
      output: undefined,
      finishReason: "stop",
      usage,
      response: { id: "request-2", modelId: "provider-model", timestamp: new Date(0) },
    };
    await adapter.generate({
      request: {
        messages: [
          {
            role: "tool",
            content: [
              {
                kind: "tool-result",
                toolCallId: TOOL_CALL_ID,
                result: [
                  { kind: "text", text: "first" },
                  { kind: "json", value: { ok: true } },
                  {
                    kind: "binary",
                    mediaType: "application/octet-stream",
                    encoding: "base64",
                    data: "AQI=",
                    byteLength: 2,
                    digest:
                      "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a" as never,
                  },
                ],
              },
            ],
          },
        ],
      },
      context: { invocationId: INVOCATION_ID },
    });

    expect(capturedGenerateOptions?.messages).toEqual([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "provider-call",
            toolName: "lookup",
            output: {
              type: "content",
              value: [
                { type: "text", text: "first" },
                {
                  type: "file",
                  data: { type: "text", text: '{"ok":true}' },
                  mediaType: "application/json",
                },
                {
                  type: "file",
                  data: { type: "data", data: "AQI=" },
                  mediaType: "application/octet-stream",
                },
              ],
            },
          },
        ],
      },
    ]);
  });

  it("fails closed on unresolved media-ref tool results", async () => {
    const adapter = createAdapter();
    setToolCallResult();
    await adapter.generate({
      request: { messages: [{ role: "user", content: [{ kind: "text", text: "lookup" }] }] },
      context: { invocationId: INVOCATION_ID },
    });
    const response = await adapter.generate({
      request: {
        messages: [
          {
            role: "tool",
            content: [
              {
                kind: "tool-result",
                toolCallId: TOOL_CALL_ID,
                result: [{ kind: "media-ref" } as never],
              },
            ],
          },
        ],
      },
      context: { invocationId: INVOCATION_ID },
    });
    expect(response).toMatchObject({ kind: "error", error: { code: "provider-error" } });
  });

  it("scopes identical provider tool-call IDs to their invocation", async () => {
    const generatedIds = [TOOL_CALL_ID, TOOL_CALL_ID_2];
    const adapter = createAdapter(() => generatedIds.shift() ?? TOOL_CALL_ID);
    setToolCallResult("same-provider-call");
    const [first, second] = await Promise.all([
      adapter.generate({
        request: { messages: [{ role: "user", content: [{ kind: "text", text: "one" }] }] },
        context: { invocationId: INVOCATION_ID },
      }),
      adapter.generate({
        request: { messages: [{ role: "user", content: [{ kind: "text", text: "two" }] }] },
        context: { invocationId: INVOCATION_ID_2 },
      }),
    ]);

    expect(first).toMatchObject({
      kind: "completion",
      content: [{ kind: "tool-call", toolCallId: TOOL_CALL_ID }],
    });
    expect(second).toMatchObject({
      kind: "completion",
      content: [{ kind: "tool-call", toolCallId: TOOL_CALL_ID_2 }],
    });
  });

  it("replays persisted tool turns across invocations in the same conversation", async () => {
    const store = createInMemoryAiSdk7ToolCallCorrelationStore({ maxScopes: 32 });
    const firstAdapter = createAdapter(() => TOOL_CALL_ID, store);
    setToolCallResult();
    const first = await firstAdapter.generate({
      request: { messages: [{ role: "user", content: [{ kind: "text", text: "lookup" }] }] },
      context: { invocationId: INVOCATION_ID, conversationId: CONVERSATION_ID },
    });
    expect(first).toMatchObject({
      kind: "completion",
      content: [{ kind: "tool-call", toolCallId: TOOL_CALL_ID }],
    });

    generated = {
      content: [{ type: "text", text: "done" }],
      output: undefined,
      finishReason: "stop",
      usage,
      response: { id: "request-2", modelId: "provider-model", timestamp: new Date(0) },
    };
    const reconstructedAdapter = createAdapter(() => TOOL_CALL_ID_2, store);
    const replay = await reconstructedAdapter.generate({
      request: {
        messages: [
          {
            role: "assistant",
            content: [
              {
                kind: "tool-call",
                toolCallId: TOOL_CALL_ID,
                name: "lookup",
                arguments: { query: "safe" },
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                kind: "tool-result",
                toolCallId: TOOL_CALL_ID,
                result: [{ kind: "json", value: { result: "found" } }],
              },
            ],
          },
        ],
      },
      context: { invocationId: INVOCATION_ID_2, conversationId: CONVERSATION_ID },
    });

    expect(replay).toMatchObject({ kind: "completion" });
    expect(capturedGenerateOptions?.messages).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "provider-call",
            toolName: "lookup",
            input: { query: "safe" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "provider-call",
            toolName: "lookup",
            output: { type: "json", value: { result: "found" } },
          },
        ],
      },
    ]);
  });

  it("fails closed after the conversation correlation retention boundary is cleared", async () => {
    const store = createInMemoryAiSdk7ToolCallCorrelationStore({ maxScopes: 32 });
    const firstAdapter = createAdapter(() => TOOL_CALL_ID, store);
    setToolCallResult();
    await firstAdapter.generate({
      request: { messages: [{ role: "user", content: [{ kind: "text", text: "lookup" }] }] },
      context: { invocationId: INVOCATION_ID, conversationId: CONVERSATION_ID },
    });
    await store.delete({
      scope: { kind: "conversation", conversationId: CONVERSATION_ID },
    });

    capturedGenerateOptions = undefined;
    const reconstructedAdapter = createAdapter(() => TOOL_CALL_ID_2, store);
    const replay = await reconstructedAdapter.generate({
      request: {
        messages: [
          {
            role: "tool",
            content: [
              {
                kind: "tool-result",
                toolCallId: TOOL_CALL_ID,
                result: [{ kind: "json", value: { result: "found" } }],
              },
            ],
          },
        ],
      },
      context: { invocationId: INVOCATION_ID_2, conversationId: CONVERSATION_ID },
    });

    expect(replay).toMatchObject({ kind: "error", error: { code: "provider-error" } });
    expect(capturedGenerateOptions).toBeUndefined();
  });

  it("bounds process-local correlation retention by least-recently-used scope", async () => {
    const options = { maxScopes: 1 };
    const store = createInMemoryAiSdk7ToolCallCorrelationStore(options);
    options.maxScopes = 2;
    await store.record({
      scope: { kind: "conversation", conversationId: CONVERSATION_ID },
      correlations: [
        {
          providerToolCallId: "provider-call-one",
          coreToolCallId: TOOL_CALL_ID,
          toolName: "lookup",
        },
      ],
    });
    await store.record({
      scope: { kind: "conversation", conversationId: CONVERSATION_ID_2 },
      correlations: [
        {
          providerToolCallId: "provider-call-two",
          coreToolCallId: TOOL_CALL_ID_2,
          toolName: "lookup",
        },
      ],
    });

    expect(
      await store.load({
        scope: { kind: "conversation", conversationId: CONVERSATION_ID },
      }),
    ).toEqual([]);
  });

  it("rejects replaying a tool turn from a different conversation", async () => {
    const adapter = createAdapter();
    setToolCallResult();
    await adapter.generate({
      request: { messages: [{ role: "user", content: [{ kind: "text", text: "lookup" }] }] },
      context: { invocationId: INVOCATION_ID, conversationId: CONVERSATION_ID },
    });

    capturedGenerateOptions = undefined;
    const replay = await adapter.generate({
      request: {
        messages: [
          {
            role: "tool",
            content: [
              {
                kind: "tool-result",
                toolCallId: TOOL_CALL_ID,
                result: [{ kind: "json", value: { result: "found" } }],
              },
            ],
          },
        ],
      },
      context: { invocationId: INVOCATION_ID_2, conversationId: CONVERSATION_ID_2 },
    });

    expect(replay).toMatchObject({ kind: "error", error: { code: "provider-error" } });
    expect(capturedGenerateOptions).toBeUndefined();
  });

  it("fails closed when generated core identities collide across conversations", async () => {
    const adapter = createAdapter();
    setToolCallResult("provider-call-one");
    const first = await adapter.generate({
      request: { messages: [{ role: "user", content: [{ kind: "text", text: "one" }] }] },
      context: { invocationId: INVOCATION_ID, conversationId: CONVERSATION_ID },
    });
    expect(first).toMatchObject({ kind: "completion" });

    setToolCallResult("provider-call-two");
    const second = await adapter.generate({
      request: { messages: [{ role: "user", content: [{ kind: "text", text: "two" }] }] },
      context: { invocationId: INVOCATION_ID_2, conversationId: CONVERSATION_ID_2 },
    });

    expect(second).toMatchObject({ kind: "error", error: { code: "provider-error" } });
  });

  it("fails closed on unknown controlled tool-result IDs", async () => {
    capturedGenerateOptions = undefined;
    const response = await createAdapter().generate({
      request: {
        messages: [
          {
            role: "tool",
            content: [
              {
                kind: "tool-result",
                toolCallId: TOOL_CALL_ID_2,
                result: [{ kind: "json", value: { ok: true } }],
              },
            ],
          },
        ],
      },
      context: { invocationId: INVOCATION_ID },
    });
    expect(response).toMatchObject({ kind: "error", error: { code: "provider-error" } });
    expect(capturedGenerateOptions).toBeUndefined();
  });

  it("fails closed when generated core tool-call IDs collide", async () => {
    generated = {
      content: [
        {
          type: "tool-call",
          toolCallId: "provider-call-1",
          toolName: "lookup",
          input: { query: "one" },
        },
        {
          type: "tool-call",
          toolCallId: "provider-call-2",
          toolName: "lookup",
          input: { query: "two" },
        },
      ],
      output: undefined,
      finishReason: "tool-calls",
      usage,
      response: { id: "request-3", modelId: "provider-model", timestamp: new Date(0) },
    };
    const response = await createAdapter().generate({
      request: { messages: [{ role: "user", content: [{ kind: "text", text: "lookup" }] }] },
      context: { invocationId: INVOCATION_ID },
    });
    expect(response).toMatchObject({ kind: "error", error: { code: "provider-error" } });
  });
});
