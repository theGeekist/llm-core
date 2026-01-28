import { describe, expect, it } from "bun:test";
import type { ToolMessage } from "@langchain/core/messages";
import { AIMessageChunk } from "@langchain/core/messages";
import type { ModelCall } from "../../src/adapters/types";
import {
  buildInvokeOptions,
  createRunState,
  readMetadataField,
  toTelemetry,
  toToolCalls,
  toToolChoice,
  toToolResults,
  toUsage,
} from "../../src/adapters/langchain/model-utils";

describe("Adapter LangChain model internals", () => {
  it("normalizes tool choice required to any", () => {
    expect(toToolChoice("required")).toBe("any");
  });

  it("passes through supported tool choice values", () => {
    expect(toToolChoice("auto")).toBe("auto");
    expect(toToolChoice("none")).toBe("none");
  });

  it("returns null tool choice for empty values", () => {
    expect(toToolChoice(null)).toBeNull();
  });

  it("maps usage metadata to model usage", () => {
    const usage = toUsage({ input_tokens: 1, output_tokens: 2, total_tokens: 3 });
    expect(usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
  });

  it("maps tool calls and results", () => {
    const calls = toToolCalls([{ id: "call-1", name: "search", args: { q: "hi" } }]);
    expect(calls[0]).toEqual({ id: "call-1", name: "search", arguments: { q: "hi" } });

    const message = {
      tool_call_id: "call-1",
      name: undefined,
      content: "ok",
      status: "success",
    } as ToolMessage;
    const results = toToolResults(message);
    expect(results[0]).toEqual({
      toolCallId: "call-1",
      name: "tool",
      result: "ok",
      isError: false,
    });
  });

  it("reads metadata fields in order", () => {
    const value = readMetadataField({ request_id: "req" }, ["id", "request_id"]);
    expect(value).toBe("req");
  });

  it("builds run state with system messages", () => {
    const call: ModelCall = { prompt: "hi", system: "sys" };
    const state = createRunState(call);
    expect(state.messages[0]?.type).toBe("system");
  });

  it("builds invoke options with response format", () => {
    const options = buildInvokeOptions("auto", {
      type: "json_schema",
      json_schema: { name: "myschems" },
    });
    expect(options).toMatchObject({
      tool_choice: "auto",
      response_format: { type: "json_schema" },
    });
  });

  it("returns null metadata field when meta is missing", () => {
    expect(readMetadataField(null, ["id"])).toBeNull();
  });

  it("builds telemetry with normalized timestamps", () => {
    const response = new AIMessageChunk({
      content: "",
      response_metadata: { created: 1, model: "gpt" },
    });
    const telemetry = toTelemetry(response, null, []);
    expect(telemetry.response?.timestamp).toBe(1000);
  });

  it("maps tool results to errors when status is error", () => {
    const message = {
      tool_call_id: "call-1",
      name: "tool",
      content: "fail",
      status: "error",
    } as ToolMessage;
    const results = toToolResults(message);
    expect(results[0]?.isError).toBe(true);
  });
});
