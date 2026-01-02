import { describe, expect, it } from "bun:test";
import { reduceInteractionEvent, reduceInteractionEvents } from "#interaction";
import type { InteractionEvent, InteractionState } from "#interaction";
import type { Document, Message } from "#adapters";

const createState = (overrides?: Partial<InteractionState>): InteractionState => ({
  messages: [],
  diagnostics: [],
  trace: [],
  events: [],
  ...overrides,
});

const createMeta = (sequence: number, sourceId = "model.primary") => ({
  sequence,
  timestamp: Date.now(),
  sourceId,
});

const readTextContent = (message: Message) =>
  typeof message.content === "string" ? message.content : message.content.text;

const readParts = (message: Message) =>
  typeof message.content === "string" ? [] : message.content.parts;

describe("interaction reducer", () => {
  it("skips events with older sequence numbers", () => {
    const state = createState({ lastSequence: 2 });
    const event: InteractionEvent = {
      kind: "diagnostic",
      entry: {
        level: "warn",
        kind: "workflow",
        message: "ignored",
      },
      meta: createMeta(2, "diag"),
    };

    const result = reduceInteractionEvent(state, event);
    expect(result).toBe(state);
  });

  it("reduces model stream events into an assistant message", () => {
    const state = createState();
    const events: InteractionEvent[] = [
      { kind: "model", event: { type: "start", id: "m1" }, meta: createMeta(1, "model.primary") },
      {
        kind: "model",
        event: { type: "delta", text: "Hello" },
        meta: createMeta(2, "model.primary"),
      },
      { kind: "model", event: { type: "end" }, meta: createMeta(3, "model.primary") },
    ];

    const result = reduceInteractionEvents(state, events);
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.role).toBe("assistant");
    expect(readTextContent(message)).toBe("Hello");
    expect(result.events).toHaveLength(3);
  });

  it("captures reasoning and tool parts in structured content", () => {
    const state = createState();
    const events: InteractionEvent[] = [
      { kind: "model", event: { type: "start", id: "m2" }, meta: createMeta(1, "model.primary") },
      {
        kind: "model",
        event: {
          type: "delta",
          reasoning: "Thinking...",
          toolCall: { id: "call-1", name: "lookup", arguments: { q: "A" } },
        },
        meta: createMeta(2, "model.primary"),
      },
      {
        kind: "model",
        event: {
          type: "delta",
          toolResult: { toolCallId: "call-1", name: "lookup", result: { ok: true } },
        },
        meta: createMeta(3, "model.primary"),
      },
      { kind: "model", event: { type: "end" }, meta: createMeta(4, "model.primary") },
    ];

    const result = reduceInteractionEvents(state, events);
    const message = result.messages[0]!;
    expect(typeof message.content).toBe("object");
    const parts = readParts(message);
    expect(parts.some((part) => part.type === "reasoning")).toBe(true);
    expect(parts.some((part) => part.type === "tool-call")).toBe(true);
    expect(parts.some((part) => part.type === "tool-result")).toBe(true);
  });

  it("reduces query stream events into a tool message with data parts", () => {
    const state = createState();
    const sources: Document[] = [{ text: "Source A", id: "doc-1" }];
    const events: InteractionEvent[] = [
      { kind: "query", event: { type: "start" }, meta: createMeta(1, "query.primary") },
      {
        kind: "query",
        event: { type: "delta", text: "Found" },
        meta: createMeta(2, "query.primary"),
      },
      {
        kind: "query",
        event: { type: "end", text: "Found", sources },
        meta: createMeta(3, "query.primary"),
      },
    ];

    const result = reduceInteractionEvents(state, events);
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.role).toBe("tool");
    expect(message.name).toBe("query.primary");
    expect(readTextContent(message)).toBe("Found");
    const parts = readParts(message);
    expect(parts).toHaveLength(2);
    expect(parts[1]!.type).toBe("data");
  });

  it("captures stream errors and diagnostics", () => {
    const state = createState();
    const event: InteractionEvent = {
      kind: "model",
      event: {
        type: "error",
        error: new Error("failed"),
        diagnostics: [{ level: "warn", message: "warn" }],
      },
      meta: createMeta(1, "model.primary"),
    };

    const result = reduceInteractionEvent(state, event);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.private?.raw?.["model.primary:error"]).toBeInstanceOf(Error);
  });

  it("records usage and event-stream payloads in private state", () => {
    const state = createState({ events: undefined });
    const usageEvent: InteractionEvent = {
      kind: "model",
      event: { type: "usage", usage: { totalTokens: 10 } },
      meta: createMeta(1, "model.primary"),
    };
    const streamEvent: InteractionEvent = {
      kind: "event-stream",
      event: { name: "interaction.model.result", data: { raw: { ok: true } } },
      meta: createMeta(2, "model.result"),
    };

    const result = reduceInteractionEvents(state, [usageEvent, streamEvent]);
    expect(result.private?.raw?.["model.primary:usage"]).toEqual(usageEvent.event);
    expect(result.private?.raw?.["event-stream:model.result"]).toEqual(streamEvent.event);
    expect(result.events).toBeUndefined();
  });

  it("stores query raw payloads in private state", () => {
    const state = createState();
    const event: InteractionEvent = {
      kind: "query",
      event: { type: "end", text: "Done", raw: { provider: "mock" } },
      meta: createMeta(1, "query.primary"),
    };

    const result = reduceInteractionEvent(state, event);
    expect(result.private?.raw?.["query.primary:raw"]).toEqual({ provider: "mock" });
  });

  it("appends trace and diagnostic events", () => {
    const state = createState({ events: undefined });
    const traceEvent: InteractionEvent = {
      kind: "trace",
      event: { kind: "trace.step", at: "now", data: { ok: true } },
      meta: createMeta(1, "trace"),
    };
    const diagEvent: InteractionEvent = {
      kind: "diagnostic",
      entry: { level: "warn", kind: "workflow", message: "warned" },
      meta: createMeta(2, "diag"),
    };

    const result = reduceInteractionEvents(state, [traceEvent, diagEvent]);
    expect(result.trace).toHaveLength(1);
    expect(result.diagnostics).toHaveLength(1);
  });

  it("reduces query error events with diagnostics", () => {
    const state = createState();
    const event: InteractionEvent = {
      kind: "query",
      event: {
        type: "error",
        error: new Error("query failed"),
        diagnostics: [{ level: "error", message: "bad query" }],
      },
      meta: createMeta(1, "query.primary"),
    };

    const result = reduceInteractionEvent(state, event);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.private?.raw?.["query.primary:error"]).toBeInstanceOf(Error);
  });
});
