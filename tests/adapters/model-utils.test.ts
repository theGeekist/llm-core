import { describe, expect, it } from "bun:test";
import {
  buildMessages,
  mapToolCalls,
  mapToolResults,
  readStructuredText,
  tryParseJson,
  toResponseFormatSchema,
} from "../../src/adapters/model-utils";
import type { Message, ToolCall, ToolResult } from "../../src/adapters/types";

const passthroughMessage = (value: Message) => value;

const mapCall = (call: { id: string; name: string }): ToolCall => ({
  id: call.id,
  name: call.name,
  arguments: {},
});

const mapResult = (item: { id: string; result: string }): ToolResult => ({
  toolCallId: item.id,
  name: "tool",
  result: item.result,
});

describe("Adapter model utilities", () => {
  it("builds messages from prompt and system", () => {
    const messages = buildMessages({ prompt: "hi", system: "sys" }, passthroughMessage);
    expect(messages[0]).toEqual({ role: "system", content: "sys" });
    expect(messages[1]).toEqual({ role: "user", content: "hi" });
  });

  it("normalizes response format schemas", () => {
    const schema = toResponseFormatSchema({ type: "object" });
    expect(schema).toMatchObject({ type: "json_schema" });
  });

  it("returns null for empty or invalid json", () => {
    expect(tryParseJson("")).toBeNull();
    expect(tryParseJson("{nope")).toBeNull();
  });

  it("reads structured text content safely", () => {
    const text = readStructuredText([
      "hello",
      { type: "text", text: "hi" },
      { type: "text", text: 2 },
    ]);
    expect(text).toBe("hellohi");
    expect(readStructuredText({})).toBe("");
  });

  it("maps tool calls with a provided mapper", () => {
    const calls = mapToolCalls([{ id: "1", name: "search" }], mapCall);
    expect(calls[0]).toEqual({ id: "1", name: "search", arguments: {} });
  });

  it("maps tool results with a provided mapper", () => {
    const results = mapToolResults([{ id: "1", result: "ok" }], mapResult);
    expect(results[0]).toEqual({ toolCallId: "1", name: "tool", result: "ok" });
  });
});
