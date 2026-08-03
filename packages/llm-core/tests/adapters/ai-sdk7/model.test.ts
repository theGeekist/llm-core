import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { coreId, type JsonValue, type ToolCallId } from "#contracts";
import { createBuiltinModelProfile, type ModelProfile } from "../../../src/features/model/runtime";
import {
  INVOCATION_ID,
  TOOL_CALL_ID,
  asAsyncIterable,
  rejectUnexpectedEmbedding,
  usage,
  type ModelAdapterOverrides,
} from "./model-fixtures";

let generated: Record<string, unknown>;
let streamed: Record<string, unknown>;
let capturedGenerateOptions: Record<string, unknown> | undefined;
let capturedStreamOptions: Record<string, unknown> | undefined;
let createAiSdk7Model: typeof import("../../../src/adapters/ai-sdk").createAiSdk7Model;
let createInMemoryAiSdk7ToolCallCorrelationStore: typeof import("../../../src/adapters/ai-sdk").createInMemoryAiSdk7ToolCallCorrelationStore;

beforeAll(async () => {
  generated = {};
  streamed = {};
  mock.module("ai", () => ({
    generateText: (options: Record<string, unknown>) => {
      capturedGenerateOptions = options;
      if (generated.throw) {
        throw generated.throw;
      }
      return generated;
    },
    streamText: (options: Record<string, unknown>) => {
      capturedStreamOptions = options;
      if (streamed.throw) {
        throw streamed.throw;
      }
      return streamed;
    },
    jsonSchema: (schema: unknown) => schema,
    tool: (definition: Record<string, unknown>) => definition,
    embed: rejectUnexpectedEmbedding,
    embedMany: rejectUnexpectedEmbedding,
    Output: {
      json: () => ({ kind: "json-output" }),
    },
  }));
  ({ createAiSdk7Model, createInMemoryAiSdk7ToolCallCorrelationStore } = await import(
    "../../../src/adapters/ai-sdk"
  ));
});

afterAll(() => mock.restore());

const createAdapter = (overrides?: ModelAdapterOverrides) =>
  createAiSdk7Model({
    model: "test-provider/test-model",
    profile: createBuiltinModelProfile(),
    toolCallCorrelationStore: createInMemoryAiSdk7ToolCallCorrelationStore({ maxScopes: 32 }),
    createToolCallId: overrides?.createToolCallId ?? (() => TOOL_CALL_ID),
    ...overrides,
  });

describe("AI SDK 7 frozen model adapter", () => {
  it("rejects a plain profile before any provider operation", () => {
    const forged = {
      ...createBuiltinModelProfile(),
      version: "not-semver",
    } as unknown as ModelProfile;

    expect(() => createAdapter({ profile: forged })).toThrow();
  });

  it("rejects UUIDv4 values returned by the tool-call identity factory", async () => {
    generated = {
      content: [
        {
          type: "tool-call",
          toolCallId: "provider-call-v4",
          toolName: "lookup",
          input: { query: "safe" },
        },
      ],
      finishReason: "tool-calls",
      usage,
      warnings: [],
    };
    const response = await createAdapter({
      createToolCallId: () => coreId<ToolCallId>("00000000-0000-4000-8000-000000000001"),
    }).generate({
      request: { messages: [{ role: "user", content: [{ kind: "text", text: "hello" }] }] },
      context: { invocationId: INVOCATION_ID },
    });

    expect(response).toMatchObject({
      kind: "error",
      error: { code: "provider-error" },
    });
  });

  it("maps multipart completion, usage, warnings, approval and redacted native metadata", async () => {
    generated = {
      content: [
        { type: "text", text: "hello" },
        { type: "reasoning", text: "thinking" },
        {
          type: "tool-call",
          toolCallId: "provider-call",
          toolName: "lookup",
          input: { query: "safe" },
        },
        {
          type: "tool-approval-request",
          approvalId: "approval-1",
          toolCall: {
            type: "tool-call",
            toolCallId: "provider-call",
            toolName: "lookup",
            input: { credential: "must-not-survive" },
          },
          signature: "must-not-survive",
        },
      ],
      output: undefined,
      finishReason: "tool-calls",
      usage,
      warnings: [{ type: "unsupported-setting", setting: "seed" }],
      response: { id: "request-1", modelId: "provider-model", timestamp: new Date(0) },
      providerMetadata: { provider: { secret: "must-not-survive", region: "sg" } },
    };
    const abortController = new AbortController();
    const adapter = createAdapter({
      resolveAbortSignal: () => abortController.signal,
      classifyToolApproval: () => "user-approval",
      redactProviderMetadata: () => ({ region: "sg" }),
    });

    const response = await adapter.generate({
      request: {
        messages: [
          { role: "system", content: [{ kind: "text", text: "be concise" }] },
          { role: "user", content: [{ kind: "text", text: "hello" }] },
        ],
        tools: [
          {
            name: "lookup",
            description: "Lookup a record",
            parameters: { type: "object", properties: { query: { type: "string" } } },
          },
        ],
      },
      context: { invocationId: INVOCATION_ID },
    });

    expect(response.kind).toBe("completion");
    if (response.kind !== "completion") {
      throw new Error("Expected completion.");
    }
    expect(response.content).toEqual([
      { kind: "text", text: "hello" },
      { kind: "reasoning", text: "thinking" },
      {
        kind: "tool-call",
        toolCallId: TOOL_CALL_ID,
        name: "lookup",
        arguments: { query: "safe" },
      },
    ]);
    expect(response.usage).toEqual({
      inputTokens: 4,
      outputTokens: 3,
      totalTokens: 7,
      reasoningTokens: 1,
      cachedInputTokens: 2,
    });
    expect(response.warnings?.[0]).toMatchObject({
      code: "ai-sdk.unsupported-setting",
      message: "AI SDK provider reported a redacted warning.",
    });
    expect(response.metadata).toMatchObject({
      provider: adapter.profile.provider,
      modelId: "provider-model",
      requestId: "request-1",
    });
    const serializedMetadata = JSON.stringify(response.metadata);
    expect(serializedMetadata).toContain('"region":"sg"');
    expect(serializedMetadata).toContain('"approvalId":"approval-1"');
    expect(serializedMetadata).not.toContain("must-not-survive");
    expect(capturedGenerateOptions?.instructions).toBe("be concise");
    expect(capturedGenerateOptions?.abortSignal).toBe(abortController.signal);

    const tools = capturedGenerateOptions?.tools as Record<string, { execute?: unknown }>;
    expect(tools.lookup?.execute).toBeUndefined();
    const approval = capturedGenerateOptions?.toolApproval as (input: {
      toolCall: { input: JsonValue; toolName: string };
    }) => Promise<string>;
    expect(await approval({ toolCall: { input: { query: "safe" }, toolName: "lookup" } })).toBe(
      "user-approval",
    );
  });

  it("uses AI SDK 7 Output.json for structured output", async () => {
    generated = {
      content: [{ type: "text", text: '{"ok":true}' }],
      output: { ok: true },
      finishReason: "stop",
      usage,
      response: { id: "request-2", modelId: "provider-model", timestamp: new Date(0) },
    };
    const response = await createAdapter().generate({
      request: {
        messages: [{ role: "user", content: [{ kind: "text", text: "json" }] }],
        responseFormat: { kind: "json" },
      },
      context: { invocationId: INVOCATION_ID },
    });

    expect(capturedGenerateOptions?.output).toEqual({ kind: "json-output" });
    expect(response).toMatchObject({
      kind: "completion",
      content: [{ kind: "json", value: { ok: true } }],
    });
  });

  it("round-trips provider tool identity when core returns a controlled result", async () => {
    const adapter = createAdapter();
    generated = {
      content: [
        {
          type: "tool-call",
          toolCallId: "provider-call",
          toolName: "lookup",
          input: { query: "safe" },
        },
      ],
      output: undefined,
      finishReason: "tool-calls",
      usage,
      response: { id: "request-3", modelId: "provider-model", timestamp: new Date(0) },
    };
    await adapter.generate({
      request: { messages: [{ role: "user", content: [{ kind: "text", text: "lookup" }] }] },
      context: { invocationId: INVOCATION_ID },
    });

    generated = {
      content: [{ type: "text", text: "done" }],
      output: undefined,
      finishReason: "stop",
      usage,
      response: { id: "request-4", modelId: "provider-model", timestamp: new Date(0) },
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
                result: [{ kind: "json", value: { ok: true } }],
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
            output: { type: "json", value: { ok: true } },
          },
        ],
      },
    ]);
  });

  it("rejects non-JSON dynamic tool input during generation", async () => {
    generated = {
      content: [
        {
          type: "tool-call",
          toolCallId: "provider-call",
          toolName: "lookup",
          input: () => "not-json",
        },
      ],
      output: undefined,
      finishReason: "tool-calls",
      usage,
      response: { id: "request-11", modelId: "provider-model", timestamp: new Date(0) },
    };
    const response = await createAdapter().generate({
      request: { messages: [{ role: "user", content: [{ kind: "text", text: "lookup" }] }] },
      context: { invocationId: INVOCATION_ID },
    });
    expect(response).toMatchObject({ kind: "error", error: { code: "provider-error" } });
    expect(JSON.stringify(response)).not.toContain("not-json");
  });

  it("denies invalid approval input before calling trusted classification", async () => {
    let classified = false;
    generated = {
      content: [{ type: "text", text: "done" }],
      output: undefined,
      finishReason: "stop",
      usage,
      response: { id: "request-12", modelId: "provider-model", timestamp: new Date(0) },
    };
    await createAdapter({
      classifyToolApproval: () => {
        classified = true;
        return "user-approval";
      },
    }).generate({
      request: {
        messages: [{ role: "user", content: [{ kind: "text", text: "lookup" }] }],
        tools: [{ name: "lookup" }],
      },
      context: { invocationId: INVOCATION_ID },
    });
    const approval = capturedGenerateOptions?.toolApproval as (input: {
      toolCall: { input: unknown; toolName: string };
    }) => Promise<string>;
    expect(await approval({ toolCall: { input: () => "not-json", toolName: "lookup" } })).toBe(
      "denied",
    );
    expect(classified).toBe(false);

    await createAdapter({ classifyToolApproval: () => "denied" }).generate({
      request: {
        messages: [{ role: "user", content: [{ kind: "text", text: "lookup" }] }],
        tools: [{ name: "lookup" }],
      },
      context: { invocationId: INVOCATION_ID },
    });
    const explicitDenial = capturedGenerateOptions?.toolApproval as (input: {
      toolCall: { input: unknown; toolName: string };
    }) => Promise<string>;
    expect(
      await explicitDenial({ toolCall: { input: { query: "safe" }, toolName: "lookup" } }),
    ).toBe("denied");
  });

  it("sanitizes provider failures", async () => {
    generated = { throw: new Error("credential=secret") };
    const response = await createAdapter().generate({
      request: { messages: [{ role: "user", content: [{ kind: "text", text: "hello" }] }] },
      context: { invocationId: INVOCATION_ID },
    });

    expect(response).toMatchObject({
      kind: "error",
      error: {
        code: "provider-error",
        message: "AI SDK provider call failed.",
        retryable: false,
      },
    });
    expect(JSON.stringify(response)).not.toContain("credential=secret");
  });

  it("maps normal streams and cancellation through the frozen stream contract", async () => {
    streamed = {
      stream: asAsyncIterable([
        { type: "text-delta", text: "hello" },
        { type: "reasoning-delta", text: "think" },
        {
          type: "tool-call",
          toolCallId: "provider-call",
          toolName: "lookup",
          input: { query: "safe" },
        },
      ]),
      usage: Promise.resolve(usage),
      finishReason: Promise.resolve("tool-calls"),
    };
    const abortController = new AbortController();
    const adapter = createAdapter({ resolveAbortSignal: () => abortController.signal });
    const events = [];
    for await (const event of adapter.stream!({
      request: { messages: [{ role: "user", content: [{ kind: "text", text: "hello" }] }] },
      context: { invocationId: INVOCATION_ID },
    })) {
      events.push(event);
    }

    expect(events.map((event) => event.kind)).toEqual([
      "start",
      "delta",
      "delta",
      "delta",
      "usage",
      "finish",
    ]);
    expect(events[3]).toMatchObject({
      kind: "delta",
      part: { kind: "tool-call", toolCallId: TOOL_CALL_ID },
    });
    expect(capturedStreamOptions?.abortSignal).toBe(abortController.signal);
  });

  it("terminates a partial stream on a redacted provider error", async () => {
    streamed = {
      stream: asAsyncIterable([
        { type: "text-delta", text: "partial" },
        { type: "error", error: new Error("secret stream failure") },
      ]),
      usage: Promise.resolve(usage),
      finishReason: Promise.resolve("error"),
    };
    const events = [];
    for await (const event of createAdapter().stream!({
      request: { messages: [{ role: "user", content: [{ kind: "text", text: "hello" }] }] },
      context: { invocationId: INVOCATION_ID },
    })) {
      events.push(event);
    }

    expect(events.map((event) => event.kind)).toEqual(["start", "delta", "error"]);
    expect(JSON.stringify(events)).not.toContain("secret stream failure");
  });

  it("rejects non-JSON dynamic tool input during streaming", async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    streamed = {
      stream: asAsyncIterable([
        {
          type: "tool-call",
          toolCallId: "provider-call",
          toolName: "lookup",
          input: cyclic,
        },
      ]),
      usage: Promise.resolve(usage),
      finishReason: Promise.resolve("tool-calls"),
    };
    const events = [];
    for await (const event of createAdapter().stream!({
      request: { messages: [{ role: "user", content: [{ kind: "text", text: "lookup" }] }] },
      context: { invocationId: INVOCATION_ID },
    })) {
      events.push(event);
    }
    expect(events.map((event) => event.kind)).toEqual(["start", "error"]);
  });

  it("maps an actual AI SDK abort stream part to a terminal cancellation error", async () => {
    streamed = {
      stream: asAsyncIterable([{ type: "abort", reason: "user-requested" }]),
      usage: Promise.resolve(usage),
      finishReason: Promise.resolve("error"),
    };
    const events = [];
    for await (const event of createAdapter().stream!({
      request: { messages: [{ role: "user", content: [{ kind: "text", text: "hello" }] }] },
      context: { invocationId: INVOCATION_ID },
    })) {
      events.push(event);
    }
    expect(events).toEqual([
      { kind: "start" },
      {
        kind: "error",
        error: {
          code: "cancelled",
          message: "AI SDK provider call was cancelled.",
          retryable: false,
          providerCode: "AbortError",
        },
      },
    ]);
  });

  it("maps a rejected AI SDK generation abort to cancellation rather than timeout", async () => {
    generated = { throw: new DOMException("Aborted", "AbortError") };

    expect(
      await createAdapter().generate({
        request: { messages: [{ role: "user", content: [{ kind: "text", text: "hello" }] }] },
        context: { invocationId: INVOCATION_ID },
      }),
    ).toMatchObject({
      kind: "error",
      error: {
        code: "cancelled",
        message: "AI SDK provider call was cancelled.",
        retryable: false,
        providerCode: "AbortError",
      },
    });
  });
});
