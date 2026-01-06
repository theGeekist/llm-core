import type { ModelCall, ToolCall, ToolResult } from "./types";

export type MessageInput = {
  messages?: ModelCall["messages"];
  prompt?: ModelCall["prompt"];
  system?: ModelCall["system"];
};

export const buildMessages = <TMessage>(
  input: MessageInput,
  toMessage: (value: NonNullable<ModelCall["messages"]>[number]) => TMessage,
): TMessage[] => {
  const messages = input.messages?.map(toMessage) ?? [];
  if (input.messages === undefined && input.prompt) {
    messages.push(toMessage({ role: "user", content: input.prompt }));
  }
  if (input.system) {
    messages.unshift(toMessage({ role: "system", content: input.system }));
  }
  return messages;
};

export const toResponseFormatSchema = (schema: Record<string, unknown>) => ({
  type: "json_schema",
  json_schema: {
    name: "response",
    schema,
  },
});

export const tryParseJson = (value: string) => {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

export const normalizeTimestamp = (value: number) =>
  value < 1_000_000_000_000 ? value * 1000 : value;

export const readStructuredText = (content: unknown) => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (typeof entry === "object" && entry && "text" in entry) {
          const text = (entry as { text?: string }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
};

export const mapToolCalls = <T>(calls: T[] | undefined, map: (call: T) => ToolCall): ToolCall[] =>
  (calls ?? []).map(map);

export const mapToolResults = <T>(
  results: T[] | undefined,
  map: (result: T) => ToolResult,
): ToolResult[] => (results ?? []).map(map);
