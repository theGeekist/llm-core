import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import {
  newCoreId,
  type InvocationId,
  type ToolCallId,
} from "#contracts";
import { createBuiltinModelProfile } from "../../../src/features/model/public";

const TOOL_CALL_ID = newCoreId<ToolCallId>("0190bd0c-0000-7000-8000-000000000081");
const TOOL_CALL_ID_2 = newCoreId<ToolCallId>("0190bd0c-0000-7000-8000-000000000082");
const INVOCATION_ID = newCoreId<InvocationId>("0190bd0c-0000-7000-8000-000000000083");
const INVOCATION_ID_2 = newCoreId<InvocationId>("0190bd0c-0000-7000-8000-000000000084");

const usage = {
  inputTokens: 1,
  inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokens: 1,
  outputTokenDetails: { textTokens: 1, reasoningTokens: 0 },
  totalTokens: 2,
};

let generated: Record<string, unknown>;
let capturedGenerateOptions: Record<string, unknown> | undefined;
let createAiSdk7Model: typeof import(
  "../../../src/adapters/providers/ai-sdk"
).createAiSdk7Model;

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
  ({ createAiSdk7Model } = await import("../../../src/adapters/providers/ai-sdk"));
});

afterAll(() => {
  mock.restore();
});

const createAdapter = (createToolCallId: () => ToolCallId = () => TOOL_CALL_ID) =>
  createAiSdk7Model({
    model: "test-provider/test-model",
    profile: createBuiltinModelProfile(),
    createToolCallId,
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
    await adapter.generate(
      { messages: [{ role: "user", content: [{ kind: "text", text: "lookup" }] }] },
      { invocationId: INVOCATION_ID },
    );
    generated = {
      content: [{ type: "text", text: "done" }],
      output: undefined,
      finishReason: "stop",
      usage,
      response: { id: "request-2", modelId: "provider-model", timestamp: new Date(0) },
    };
    await adapter.generate(
      {
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
      { invocationId: INVOCATION_ID },
    );

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
    await adapter.generate(
      { messages: [{ role: "user", content: [{ kind: "text", text: "lookup" }] }] },
      { invocationId: INVOCATION_ID },
    );
    const response = await adapter.generate(
      {
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
      { invocationId: INVOCATION_ID },
    );
    expect(response).toMatchObject({ kind: "error", error: { code: "provider-error" } });
  });

  it("scopes identical provider tool-call IDs to their invocation", async () => {
    const generatedIds = [TOOL_CALL_ID, TOOL_CALL_ID_2];
    const adapter = createAdapter(() => generatedIds.shift() ?? TOOL_CALL_ID);
    setToolCallResult("same-provider-call");
    const [first, second] = await Promise.all([
      adapter.generate(
        { messages: [{ role: "user", content: [{ kind: "text", text: "one" }] }] },
        { invocationId: INVOCATION_ID },
      ),
      adapter.generate(
        { messages: [{ role: "user", content: [{ kind: "text", text: "two" }] }] },
        { invocationId: INVOCATION_ID_2 },
      ),
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

  it("fails closed on unknown controlled tool-result IDs", async () => {
    capturedGenerateOptions = undefined;
    const response = await createAdapter().generate(
      {
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
      { invocationId: INVOCATION_ID },
    );
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
    const response = await createAdapter().generate(
      { messages: [{ role: "user", content: [{ kind: "text", text: "lookup" }] }] },
      { invocationId: INVOCATION_ID },
    );
    expect(response).toMatchObject({ kind: "error", error: { code: "provider-error" } });
  });
});
