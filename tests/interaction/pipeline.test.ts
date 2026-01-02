import { describe, expect, it } from "bun:test";
import { createInteractionPipelineWithDefaults, runInteractionPipeline } from "#interaction";
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

describe("interaction pipeline", () => {
  it("captures input and generates a response", async () => {
    const pipeline = createInteractionPipelineWithDefaults();
    const model = createModel("Hello!");
    const input = { message: createMessage("Hi") };

    const result = await runInteractionPipeline(pipeline, {
      input,
      adapters: { model },
    });

    expect(result.artifact.messages).toHaveLength(2);
    expect(result.artifact.messages[0]?.role).toBe("user");
    expect(result.artifact.messages[1]?.role).toBe("assistant");
  });

  it("returns sync results when adapters are sync", () => {
    const pipeline = createInteractionPipelineWithDefaults();
    const model = createModel("Sync!");
    const input = { message: createMessage("Hi") };

    const result = runInteractionPipeline(pipeline, {
      input,
      adapters: { model },
    });

    expect(isPromiseLike(result)).toBe(false);
    if (isPromiseLike(result)) {
      throw new Error("Expected sync run result.");
    }
    expect(result.artifact.messages).toHaveLength(2);
    expect(result.artifact.messages[1]?.content).toBe("Sync!");
  });

  it("returns async results when adapters are async", async () => {
    const pipeline = createInteractionPipelineWithDefaults();
    const model: Model = {
      generate: () => Promise.resolve(createModelResult("Async!")),
    };
    const input = { message: createMessage("Hi") };

    const result = runInteractionPipeline(pipeline, {
      input,
      adapters: { model },
    });

    expect(isPromiseLike(result)).toBe(true);
    const awaited = await result;
    expect(awaited.artifact.messages[1]?.content).toBe("Async!");
  });

  it("streams sync iterables and assembles messages", async () => {
    const pipeline = createInteractionPipelineWithDefaults();
    const model: Model = {
      generate: () => createModelResult("unused"),
      stream: () => [
        { type: "start", id: "sync-1" },
        { type: "delta", text: "Hello" },
        { type: "end" },
      ],
    };
    const input = { message: createMessage("Hi") };

    const result = runInteractionPipeline(pipeline, {
      input,
      adapters: { model },
    });

    expect(isPromiseLike(result)).toBe(true);
    const awaited = await result;
    expect(awaited.artifact.messages[1]?.content).toBe("Hello");
  });

  it("records stream errors in private state", async () => {
    const pipeline = createInteractionPipelineWithDefaults();
    const model: Model = {
      generate: () => createModelResult("unused"),
      stream: async function* () {
        yield { type: "start", id: "err-1" };
        throw new Error("stream-failed");
      },
    };
    const input = { message: createMessage("Hi") };

    const result = await runInteractionPipeline(pipeline, {
      input,
      adapters: { model },
    });

    const raw = result.artifact.private?.raw;
    expect(raw && raw["model.primary:error"]).toBeInstanceOf(Error);
  });

  it("includes tool calls in non-stream model results", async () => {
    const pipeline = createInteractionPipelineWithDefaults();
    const model: Model = {
      generate: () => ({
        text: "Done",
        toolCalls: [{ id: "call-1", name: "lookup", arguments: { q: "A" } }],
        toolResults: [{ toolCallId: "call-1", name: "lookup", result: { ok: true } }],
        raw: { provider: "mock" },
      }),
    };
    const input = { message: createMessage("Hi") };

    const result = await runInteractionPipeline(pipeline, {
      input,
      adapters: { model },
    });

    const message = result.artifact.messages[1];
    if (!message || typeof message.content === "string") {
      throw new Error("Expected structured assistant content.");
    }
    const parts = message.content.parts;
    expect(parts.some((part) => part.type === "tool-call")).toBe(true);
    expect(parts.some((part) => part.type === "tool-result")).toBe(true);
    expect(result.artifact.private?.raw?.["event-stream:model.result"]).toEqual({
      name: "interaction.model.result",
      data: { raw: { provider: "mock" } },
    });
  });

  it("uses messages when text is missing and preserves reasoning", async () => {
    const pipeline = createInteractionPipelineWithDefaults();
    const model: Model = {
      generate: () => ({
        messages: [{ role: "assistant", content: { text: "From message", parts: [] } }],
        reasoning: "Because it can.",
      }),
    };
    const input = { message: createMessage("Hi") };

    const result = await runInteractionPipeline(pipeline, {
      input,
      adapters: { model },
    });

    const message = result.artifact.messages[1];
    if (!message || typeof message.content === "string") {
      throw new Error("Expected structured assistant content.");
    }
    expect(message.content.text).toBe("From message");
    expect(message.content.parts.some((part) => part.type === "reasoning")).toBe(true);
  });
});
