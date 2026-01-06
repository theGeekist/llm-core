import { describe, expect, it } from "bun:test";
import { createInteractionEngine } from "#interaction";
import { isPromiseLike } from "@wpkernel/pipeline/core";
import type { Message, Model, ModelResult } from "#adapters";

const createModelResult = (text: string): ModelResult => ({
  text,
});

const createModel = (text: string): Model => ({
  generate: () => createModelResult(text),
});

const createMessage = (text: string): Message => ({
  role: "user",
  content: text,
});

describe("interaction engine", () => {
  it("runs a chat turn with a flat input", () => {
    const engine = createInteractionEngine({ adapters: { model: createModel("hello") } });
    const result = engine.run({ message: createMessage("hi") });

    expect(isPromiseLike(result)).toBe(false);
    if (isPromiseLike(result)) {
      throw new Error("Expected sync engine result.");
    }

    expect(result.state.messages).toHaveLength(2);
    expect(result.state.messages[1]?.content).toBe("hello");
  });

  it("surfaces captured events when requested", () => {
    const engine = createInteractionEngine({ adapters: { model: createModel("hello") } });
    const result = engine.run({ message: createMessage("hi"), captureEvents: true });

    expect(isPromiseLike(result)).toBe(false);
    if (isPromiseLike(result)) {
      throw new Error("Expected sync engine result.");
    }

    expect(result.events).toBeArray();
    expect(result.events && result.events.length > 0).toBe(true);
  });
});
