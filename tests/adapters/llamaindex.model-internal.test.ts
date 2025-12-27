import { describe, expect, it } from "bun:test";
import type { LLM, ToolCall as LlamaToolCall } from "@llamaindex/core/llms";
import {
  appendTelemetryResponse,
  createRunState,
  getExec,
  getStreamExec,
  mapToolCall,
  parseOutput,
  readMessageText,
  readUsagePayload,
  toToolCalls,
  toResponseTelemetry,
  toUsage,
} from "../../src/adapters/llamaindex/model-utils";
import type { ModelCall } from "../../src/adapters/types";

const createModel = (metadata: Record<string, unknown>): LLM => ({ metadata }) as unknown as LLM;

describe("Adapter LlamaIndex model internals", () => {
  it("reads usage payloads from raw responses", () => {
    const payload = readUsagePayload({ usage: { input_tokens: 1 } });
    expect(payload).toEqual({ input_tokens: 1 });
  });

  it("returns undefined when usage payload is missing", () => {
    expect(readUsagePayload({})).toBeUndefined();
    expect(readUsagePayload(null)).toBeUndefined();
  });

  it("maps usage payloads into model usage", () => {
    const usage = toUsage({ usage: { output_tokens: 2 } });
    expect(usage).toEqual({ inputTokens: undefined, outputTokens: 2, totalTokens: undefined });
  });

  it("returns undefined usage when no token counts are present", () => {
    expect(toUsage({ usage: {} })).toBeUndefined();
  });

  it("normalizes response telemetry", () => {
    const telemetry = toResponseTelemetry({ id: "req", created: 1 });
    expect(telemetry?.timestamp).toBe(1000);
  });

  it("returns undefined telemetry when no fields are present", () => {
    expect(toResponseTelemetry({})).toBeUndefined();
  });

  it("appends telemetry responses when provided", () => {
    const next = appendTelemetryResponse({}, { model: "llama" });
    expect(next?.response?.modelId).toBe("llama");
  });

  it("returns existing telemetry when nothing new is provided", () => {
    const telemetry = { response: { id: "keep" } };
    const next = appendTelemetryResponse(telemetry, {});
    expect(next).toBe(telemetry);
  });

  it("builds run state with prompt messages", () => {
    const model = createModel({ model: "llama" });
    const call: ModelCall = { prompt: "hi" };
    const state = createRunState(model, call);
    expect(state.messages.length).toBe(1);
  });

  it("exposes undefined exec handlers when missing", () => {
    const model = createModel({});
    expect(getExec(model)).toBeUndefined();
    expect(getStreamExec(model)).toBeUndefined();
  });

  it("maps tool calls into adapter tool calls", () => {
    const calls: LlamaToolCall[] = [
      { id: "tool-1", name: "search", input: { q: "hi" } },
      { id: "tool-2", name: "calc", input: { x: 2 } },
    ];
    const mapped = toToolCalls(calls);
    expect(mapped[0]).toEqual({ id: "tool-1", name: "search", arguments: { q: "hi" } });
    expect(mapped[1]).toEqual({ id: "tool-2", name: "calc", arguments: { x: 2 } });
    expect(mapToolCall(calls[0]!)).toEqual({
      id: "tool-1",
      name: "search",
      arguments: { q: "hi" },
    });
  });

  it("reads message text from structured content", () => {
    const content = [{ type: "text", text: "hello" }];
    expect(readMessageText(content)).toBe("hello");
  });

  it("parses output when asked and returns objects when provided", () => {
    expect(parseOutput('{"ok":true}', true, undefined)).toEqual({ ok: true });
    expect(parseOutput("ignored", true, { ok: true })).toEqual({ ok: true });
    expect(parseOutput('{"ok":true}', false, undefined)).toBeUndefined();
  });
});
