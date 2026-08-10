import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { APICallError } from "@ai-sdk/provider";
import type { AiSdk7NativeEvent } from "../../../src/adapters/ai-sdk";
import { createBuiltinModelProfile } from "../../../src/features/model/runtime";
import {
  INVOCATION_ID,
  TOOL_CALL_ID,
  asAsyncIterable,
  completeGenerateTextResult,
  rejectUnexpectedEmbedding,
  usage,
} from "./model-fixtures";

let generated: Record<string, unknown>;
let streamed: Record<string, unknown>;
let createAiSdk7Model: typeof import("../../../src/adapters/ai-sdk").createAiSdk7Model;
let createStore: typeof import("../../../src/adapters/ai-sdk").createInMemoryAiSdk7ToolCallCorrelationStore;

beforeAll(async () => {
  mock.module("ai", () => ({
    generateText: () => {
      if (generated.throw) throw generated.throw;
      return completeGenerateTextResult(generated);
    },
    streamText: () => streamed,
    jsonSchema: (schema: unknown) => schema,
    tool: (definition: Record<string, unknown>) => definition,
    embed: rejectUnexpectedEmbedding,
    embedMany: rejectUnexpectedEmbedding,
    Output: { json: () => ({ kind: "json-output" }) },
  }));
  ({ createAiSdk7Model, createInMemoryAiSdk7ToolCallCorrelationStore: createStore } = await import(
    "../../../src/adapters/ai-sdk"
  ));
});

afterAll(() => mock.restore());
beforeEach(() => {
  generated = {};
  streamed = {};
});

const request = {
  messages: [{ role: "user" as const, content: [{ kind: "text" as const, text: "hello" }] }],
};

const createAdapter = (
  events: AiSdk7NativeEvent[],
  redact?: (event: Omit<AiSdk7NativeEvent, "namespace">) => AiSdk7NativeEvent["value"] | undefined,
) =>
  createAiSdk7Model({
    model: "test-provider/test-model",
    profile: createBuiltinModelProfile(),
    toolCallCorrelationStore: createStore({ maxScopes: 32 }),
    createToolCallId: () => TOOL_CALL_ID,
    nativeContract: {
      redact: redact ?? (({ value }) => value),
      observe: (event) => {
        events.push(event);
      },
    },
  });

describe("AI SDK 7 native response contract", () => {
  it("preserves redacted completion metadata, warning detail, approval, files and sources", async () => {
    const events: AiSdk7NativeEvent[] = [];
    generated = {
      content: [
        { type: "text", text: "hello", providerMetadata: { provider: { secret: "redact" } } },
        {
          type: "tool-approval-request",
          approvalId: "approval-1",
          toolCall: {
            type: "tool-call",
            toolCallId: "provider-call",
            toolName: "lookup",
            input: {},
          },
          signature: "redact-signature",
        },
      ],
      files: [{ mediaType: "text/plain", base64: "aGVsbG8=" }],
      sources: [
        {
          type: "source",
          sourceType: "url",
          id: "source-1",
          url: "https://example.test",
          title: "Example",
        },
      ],
      warnings: [{ type: "other", message: "Provider retained exact detail" }],
      providerMetadata: { provider: { secret: "redact", region: "sg" } },
      response: { id: "request-1", modelId: "provider-model", timestamp: new Date(0) },
      finishReason: "stop",
      usage,
    };
    const adapter = createAdapter(events, ({ kind, value }): AiSdk7NativeEvent["value"] => {
      if (kind === "provider-metadata") return { provider: { region: "sg" } };
      if (kind === "approval") return { approvalId: "approval-1", toolCallId: "provider-call" };
      if (kind === "step" || kind === "final-step") return { redacted: true };
      if (kind === "content" && JSON.stringify(value).includes("secret")) {
        return { type: "text", text: "hello", providerMetadata: { provider: { region: "sg" } } };
      }
      return value;
    });

    const response = await adapter.generate({ request, context: { invocationId: INVOCATION_ID } });

    expect(response).toMatchObject({
      kind: "completion",
      warnings: [{ code: "ai-sdk.other", message: "Provider retained exact detail" }],
    });
    expect(events.map(({ kind, path }) => ({ kind, path }))).toEqual([
      { kind: "content", path: "content[0]" },
      { kind: "approval", path: "content[1]" },
      { kind: "warning", path: "warnings[0]" },
      { kind: "generated-file", path: "files[0]" },
      { kind: "source", path: "sources[0]" },
      { kind: "response-metadata", path: "response" },
      { kind: "provider-metadata", path: "providerMetadata" },
      { kind: "step", path: "steps[0]" },
      { kind: "final-step", path: "finalStep" },
      { kind: "generate-result", path: "result" },
    ]);
    expect(JSON.stringify(events)).not.toContain('"secret":"redact"');
    expect(JSON.stringify(events)).not.toContain("redact-signature");
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "generated-file",
        value: { mediaType: "text/plain", base64: "aGVsbG8=" },
      }),
    );
  });

  it("rejects completion when required native redaction declines a supplied fact", async () => {
    generated = {
      content: [{ type: "text", text: "hello" }],
      providerMetadata: { provider: { region: "sg" } },
      finishReason: "stop",
      usage,
    };
    const response = await createAdapter([], ({ kind, value }) =>
      kind === "provider-metadata" ? undefined : value,
    ).generate({ request, context: { invocationId: INVOCATION_ID } });
    expect(response).toMatchObject({ kind: "error", error: { code: "provider-error" } });
  });

  it("rejects hostile native proxies before invoking trusted redaction", async () => {
    const redactedKinds: string[] = [];
    generated = {
      content: [{ type: "text", text: "hello" }],
      providerMetadata: new Proxy({ provider: { region: "sg" } }, {}),
      finishReason: "stop",
      usage,
    };
    const response = await createAdapter([], ({ value }) => {
      redactedKinds.push(JSON.stringify(value));
      return value;
    }).generate({ request, context: { invocationId: INVOCATION_ID } });
    expect(response).toMatchObject({ kind: "error", error: { code: "provider-error" } });
    expect(redactedKinds).not.toContainEqual(expect.stringContaining("region"));
  });

  it("preserves a redacted provider failure before returning the portable error", async () => {
    const events: AiSdk7NativeEvent[] = [];
    generated = { throw: new Error("credential=redact") };
    const response = await createAdapter(events, ({ kind, value }) =>
      kind === "error" ? { name: "Error", message: "provider failure" } : value,
    ).generate({ request, context: { invocationId: INVOCATION_ID } });

    expect(response).toMatchObject({ kind: "error", error: { code: "provider-error" } });
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "error",
        path: "error",
        value: { name: "Error", message: "provider failure" },
      }),
    );
    expect(JSON.stringify(events)).not.toContain("credential=redact");
  });

  it("uses only redacted warning, response and structured output for portable projection", async () => {
    const events: AiSdk7NativeEvent[] = [];
    generated = {
      content: [{ type: "text", text: '{"credential":"original"}' }],
      output: { credential: "original" },
      finishReason: "stop",
      usage,
      warnings: [{ type: "other", message: "original warning" }],
      response: {
        id: "original-request",
        modelId: "original-model",
        timestamp: new Date(0),
      },
    };
    const response = await createAdapter(events, ({ kind, value }) => {
      if (kind === "warning") return { type: "other", message: "safe warning" };
      if (kind === "response-metadata") {
        return { messages: [], id: "safe-request", modelId: "safe-model", timestamp: "safe" };
      }
      if (kind === "structured-output") return { safe: true };
      if (kind === "generate-result") {
        return { ...(value as Record<string, unknown>), text: '{"safe":true}' };
      }
      if (kind === "content" || kind === "step" || kind === "final-step") {
        return { redacted: true };
      }
      return value;
    }).generate({
      request: { ...request, responseFormat: { kind: "json" } },
      context: { invocationId: INVOCATION_ID },
    });

    expect(response).toMatchObject({
      kind: "completion",
      content: [{ kind: "json", value: { safe: true } }],
      warnings: [{ code: "ai-sdk.other", message: "safe warning" }],
      metadata: { requestId: "safe-request", modelId: "safe-model" },
    });
    expect(JSON.stringify(response)).not.toContain("original");
    expect(JSON.stringify(events)).not.toContain("original");
  });

  it("detaches and freezes redactor input, observer value and returned metadata", async () => {
    const events: AiSdk7NativeEvent[] = [];
    const projection = { provider: { region: "sg" } };
    let redactorInputFrozen = false;
    generated = {
      content: [{ type: "text", text: "hello" }],
      providerMetadata: { provider: { secret: "original" } },
      finishReason: "stop",
      usage,
    };
    const response = await createAdapter(events, (event) => {
      redactorInputFrozen = Object.isFrozen(event.value) && Object.isFrozen(event);
      return event.kind === "provider-metadata" ? projection : event.value;
    }).generate({ request, context: { invocationId: INVOCATION_ID } });
    projection.provider.region = "mutated";

    expect(redactorInputFrozen).toBe(true);
    const providerEvent = events.find(({ kind }) => kind === "provider-metadata");
    expect(Object.isFrozen(providerEvent)).toBe(true);
    expect(Object.isFrozen(providerEvent?.value)).toBe(true);
    expect(JSON.stringify(providerEvent)).toContain("sg");
    expect(JSON.stringify(response)).toContain("sg");
    expect(JSON.stringify(response)).not.toContain("mutated");
  });

  it("rejects hidden, accessor, symbol, sparse and array-extra native data without invoking it", async () => {
    let reads = 0;
    const hostileValues: unknown[] = [];
    const hidden = { visible: true };
    Object.defineProperty(hidden, "hidden", { value: "secret", enumerable: false });
    hostileValues.push(hidden);
    const accessor = { visible: true };
    Object.defineProperty(accessor, "hidden", {
      get: () => {
        reads += 1;
        return "secret";
      },
      enumerable: false,
    });
    hostileValues.push(accessor, { [Symbol("secret")]: true });
    const sparse = new Array(2);
    sparse[0] = "present";
    hostileValues.push(sparse);
    const extra = ["present"] as unknown[] & { extra?: string };
    extra.extra = "secret";
    hostileValues.push(extra);

    for (const providerValue of hostileValues) {
      generated = {
        content: [{ type: "text", text: "hello" }],
        providerMetadata: { provider: providerValue },
        finishReason: "stop",
        usage,
      };
      const response = await createAdapter([]).generate({
        request,
        context: { invocationId: INVOCATION_ID },
      });
      expect(response).toMatchObject({ kind: "error", error: { code: "provider-error" } });
    }
    expect(reads).toBe(0);
  });

  it("rejects raw streams and provider-executed tools before observation or portable projection", async () => {
    for (const part of [
      {
        type: "tool-call",
        toolCallId: "provider-call",
        toolName: "lookup",
        input: {},
        providerExecuted: true,
      },
      {
        type: "tool-result",
        toolCallId: "provider-call",
        toolName: "lookup",
        input: {},
        output: { unsafe: true },
        providerExecuted: true,
      },
      {
        type: "tool-approval-request",
        approvalId: "approval-1",
        toolCall: {
          type: "tool-call",
          toolCallId: "provider-call",
          toolName: "lookup",
          input: {},
          providerExecuted: true,
        },
      },
    ]) {
      const events: AiSdk7NativeEvent[] = [];
      generated = { content: [part], finishReason: "stop", usage };
      const response = await createAdapter(events).generate({
        request,
        context: { invocationId: INVOCATION_ID },
      });
      expect(response).toMatchObject({ kind: "error", error: { code: "provider-error" } });
      expect(events).not.toContainEqual(expect.objectContaining({ path: "content[0]" }));
    }

    const events: AiSdk7NativeEvent[] = [];
    streamed = {
      stream: asAsyncIterable([{ type: "raw", rawValue: { unsafe: true } }]),
      usage: Promise.resolve(usage),
      finishReason: Promise.resolve("stop"),
    };
    const output = [];
    for await (const event of createAdapter(events).stream!({
      request,
      context: { invocationId: INVOCATION_ID },
    })) {
      output.push(event);
    }
    expect(events).not.toContainEqual(expect.objectContaining({ path: "stream[0]" }));
    expect(output).toHaveLength(2);
    expect(output[0]).toEqual({ kind: "start" });
    expect(output[1]).toMatchObject({ kind: "error", error: { code: "provider-error" } });
  });

  it("guards error and generated-byte proxies before prototype reflection", async () => {
    let prototypeReads = 0;
    generated = {
      throw: new Proxy(new Error("hidden"), {
        getPrototypeOf: (target) => {
          prototypeReads += 1;
          return Reflect.getPrototypeOf(target);
        },
      }),
    };
    const errorResponse = await createAdapter([]).generate({
      request,
      context: { invocationId: INVOCATION_ID },
    });
    expect(errorResponse).toMatchObject({ kind: "error", error: { code: "provider-error" } });

    const bytes = new Proxy(new Uint8Array([1, 2]), {
      getPrototypeOf: (target) => {
        prototypeReads += 1;
        return Reflect.getPrototypeOf(target);
      },
    });
    generated = {
      content: [
        { type: "file", file: { mediaType: "application/octet-stream", uint8ArrayData: bytes } },
      ],
      finishReason: "stop",
      usage,
    };
    const fileResponse = await createAdapter([]).generate({
      request,
      context: { invocationId: INVOCATION_ID },
    });
    expect(fileResponse).toMatchObject({ kind: "error", error: { code: "provider-error" } });
    expect(prototypeReads).toBe(0);
  });

  it("closes generated-file and file-part descriptors and validates duplicate representations", async () => {
    let reads = 0;
    const validFile = { mediaType: "application/octet-stream", base64: "AQI=" };
    const hostileFiles: object[] = [];
    const hiddenFile = { ...validFile };
    Object.defineProperty(hiddenFile, "hidden", { value: "secret", enumerable: false });
    hostileFiles.push(hiddenFile);
    const accessorFile = { ...validFile };
    Object.defineProperty(accessorFile, "hidden", {
      get: () => {
        reads += 1;
        return "secret";
      },
    });
    hostileFiles.push(accessorFile, { ...validFile, [Symbol("secret")]: true });
    hostileFiles.push({ ...validFile, uint8ArrayData: new Uint8Array([3]) });

    for (const file of hostileFiles) {
      generated = { content: [{ type: "file", file }], finishReason: "stop", usage };
      const response = await createAdapter([]).generate({
        request,
        context: { invocationId: INVOCATION_ID },
      });
      expect(response).toMatchObject({ kind: "error", error: { code: "provider-error" } });
    }

    for (const property of ["hidden-data", "hidden-accessor", "symbol"] as const) {
      const part: Record<PropertyKey, unknown> = { type: "file", file: validFile };
      if (property === "hidden-data") {
        Object.defineProperty(part, "hidden", { value: "secret", enumerable: false });
      } else if (property === "hidden-accessor") {
        Object.defineProperty(part, "hidden", {
          get: () => {
            reads += 1;
            return "secret";
          },
        });
      } else {
        part[Symbol("secret")] = true;
      }
      generated = { content: [part], finishReason: "stop", usage };
      const response = await createAdapter([]).generate({
        request,
        context: { invocationId: INVOCATION_ID },
      });
      expect(response).toMatchObject({ kind: "error", error: { code: "provider-error" } });
    }

    const events: AiSdk7NativeEvent[] = [];
    generated = {
      content: [
        {
          type: "reasoning-file",
          file: {
            mediaType: "application/octet-stream",
            base64: "AQI=",
            uint8ArrayData: new Uint8Array([1, 2]),
          },
        },
      ],
      finishReason: "stop",
      usage,
    };
    const response = await createAdapter(events).generate({
      request,
      context: { invocationId: INVOCATION_ID },
    });
    expect(response).toMatchObject({ kind: "completion" });
    expect(events).toContainEqual(
      expect.objectContaining({
        path: "content[0]",
        value: {
          type: "reasoning-file",
          file: { mediaType: "application/octet-stream", base64: "AQI=" },
        },
      }),
    );
    expect(reads).toBe(0);
  });

  it("projects the pinned Provider 4 APICallError family before redaction", async () => {
    const events: AiSdk7NativeEvent[] = [];
    generated = {
      throw: new APICallError({
        message: "provider rejected request",
        url: "https://provider.test",
        requestBodyValues: { credential: "redact" },
        statusCode: 429,
        responseHeaders: { "retry-after": "1" },
        responseBody: "redact",
        isRetryable: true,
        data: { requestId: "redact" },
      }),
    };
    await createAdapter(events, ({ kind, value }) =>
      kind === "error" ? { family: "api-call-error", statusCode: 429, isRetryable: true } : value,
    ).generate({ request, context: { invocationId: INVOCATION_ID } });

    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "error",
        value: { family: "api-call-error", statusCode: 429, isRetryable: true },
      }),
    );
    expect(JSON.stringify(events)).not.toContain("redact");
  });

  it("observes every AI SDK stream part before its portable projection", async () => {
    const events: AiSdk7NativeEvent[] = [];
    streamed = {
      stream: asAsyncIterable([
        { type: "start" },
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", text: "hello" },
        { type: "source", sourceType: "url", id: "source-1", url: "https://example.test" },
        { type: "file", file: { mediaType: "text/plain", base64: "aGVsbG8=" } },
        {
          type: "tool-approval-request",
          approvalId: "approval-1",
          toolCall: {
            type: "tool-call",
            toolCallId: "provider-call",
            toolName: "lookup",
            input: {},
          },
        },
        { type: "text-end", id: "text-1" },
        { type: "finish", finishReason: "stop", totalUsage: usage },
      ]),
      usage: Promise.resolve(usage),
      finishReason: Promise.resolve("stop"),
    };
    const output = [];
    for await (const event of createAdapter(events).stream!({
      request,
      context: { invocationId: INVOCATION_ID },
    })) {
      output.push(event);
    }

    expect(events).toHaveLength(8);
    expect(events.map(({ path }) => path)).toEqual([
      "stream[0]",
      "stream[1]",
      "stream[2]",
      "stream[3]",
      "stream[4]",
      "stream[5]",
      "stream[6]",
      "stream[7]",
    ]);
    expect(output).toContainEqual({ kind: "delta", part: { kind: "text", text: "hello" } });
    expect(output.at(-1)).toMatchObject({ kind: "finish", finishReason: "stop" });
  });
});
