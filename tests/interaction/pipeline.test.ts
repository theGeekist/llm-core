import { describe, expect, it } from "bun:test";
import {
  createInteractionPipelineWithDefaults,
  registerInteractionPack,
  runInteractionPipeline,
} from "#interaction";
import { isPromiseLike } from "@wpkernel/pipeline/core";
import type { Message, MessagePart, Model, ModelResult, ModelStreamEvent } from "#adapters";
import type {
  InteractionRunOutcome,
  InteractionRunResult,
  InteractionState,
  InteractionStepApply,
} from "#interaction";
import type { PipelinePaused } from "@wpkernel/pipeline/core";

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

const PAUSE_TOKEN = "interaction:pause";
const PAUSE_MARKER_KEY = "test.pause.once";

const isPausedResult = (value: unknown): value is PipelinePaused<Record<string, unknown>> =>
  !!value &&
  typeof value === "object" &&
  "__paused" in value &&
  (value as { __paused?: unknown }).__paused === true;

function assertRunResult(result: InteractionRunOutcome): InteractionRunResult {
  if (isPausedResult(result)) {
    throw new Error("Expected interaction run result.");
  }
  return result;
}

const readPauseMarker = (state: InteractionState) => {
  const raw = state.private?.raw;
  if (!raw) {
    return false;
  }
  return raw[PAUSE_MARKER_KEY] === true;
};

const applyPauseRequest = (state: InteractionState) => {
  const raw = state.private?.raw ?? {};
  state.private = {
    ...state.private,
    raw: { ...raw, [PAUSE_MARKER_KEY]: true },
    pause: { token: PAUSE_TOKEN, pauseKind: "human" },
  };
  return state;
};

const applyPauseOnce: InteractionStepApply = function applyPauseOnce(options) {
  const state = options.output;
  if (readPauseMarker(state)) {
    return { output: state };
  }
  return { output: applyPauseRequest(state) };
};

const PauseOncePack = {
  name: "interaction-pause",
  steps: [
    {
      name: "pause-once",
      apply: applyPauseOnce,
      dependsOn: ["interaction-core.run-model"],
    },
  ],
};

describe("interaction pipeline", () => {
  it("captures input and generates a response", async () => {
    const pipeline = createInteractionPipelineWithDefaults();
    const model = createModel("Hello!");
    const input = { message: createMessage("Hi") };

    const result = await runInteractionPipeline(pipeline, {
      input,
      adapters: { model },
    });

    const runResult = assertRunResult(result);
    expect(runResult.artifact.messages).toHaveLength(2);
    expect(runResult.artifact.messages[0]?.role).toBe("user");
    expect(runResult.artifact.messages[1]?.role).toBe("assistant");
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
    const runResult = assertRunResult(result);
    expect(runResult.artifact.messages).toHaveLength(2);
    expect(runResult.artifact.messages[1]?.content).toBe("Sync!");
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
    const awaited = assertRunResult(await result);
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

    expect(isPromiseLike(result)).toBe(false);
    if (isPromiseLike(result)) {
      throw new Error("Expected sync run result.");
    }
    const runResult = assertRunResult(result);
    expect(runResult.artifact.messages[1]?.content).toBe("Hello");
  });

  it("records stream errors in private state", async () => {
    const pipeline = createInteractionPipelineWithDefaults();
    const model: Model = {
      generate: () => createModelResult("unused"),
      stream: async function* (): AsyncIterable<ModelStreamEvent> {
        yield { type: "start", id: "err-1" };
        yield { type: "delta", text: "Partial" };
        throw new Error("stream-failed");
      },
    };
    const input = { message: createMessage("Hi") };

    const result = await runInteractionPipeline(pipeline, {
      input,
      adapters: { model },
    });

    const runResult = assertRunResult(result);
    expect(runResult.artifact.messages).toHaveLength(2);
    expect(runResult.artifact.messages[1]?.content).toBe("Partial");
    const streams = runResult.artifact.private?.streams ?? {};
    expect(Object.keys(streams)).toHaveLength(0);
    const raw = runResult.artifact.private?.raw;
    expect(raw && raw["model.primary:error"]).toBeInstanceOf(Error);
  });

  it("records generate errors in private state", async () => {
    const pipeline = createInteractionPipelineWithDefaults();
    const error = new Error("generate-failed");
    const model: Model = {
      generate: () => {
        throw error;
      },
    };
    const input = { message: createMessage("Hi") };

    const result = await runInteractionPipeline(pipeline, {
      input,
      adapters: { model },
    });

    const runResult = assertRunResult(result);
    const raw = runResult.artifact.private?.raw;
    expect(raw && raw["model.primary:error"]).toBe(error);
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

    const runResult = assertRunResult(result);
    const message = runResult.artifact.messages[1];
    if (!message || typeof message.content === "string") {
      throw new Error("Expected structured assistant content.");
    }
    const parts = message.content.parts as MessagePart[];
    expect(parts.some((part: MessagePart) => part.type === "tool-call")).toBe(true);
    expect(parts.some((part: MessagePart) => part.type === "tool-result")).toBe(true);
    expect(runResult.artifact.private?.raw?.["event-stream:model.result"]).toEqual({
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

    const runResult = assertRunResult(result);
    const message = runResult.artifact.messages[1];
    if (!message || typeof message.content === "string") {
      throw new Error("Expected structured assistant content.");
    }
    expect(message.content.text).toBe("From message");
    const parts = message.content.parts as MessagePart[];
    expect(parts.some((part: MessagePart) => part.type === "reasoning")).toBe(true);
  });

  it("pauses and resumes when a step requests a pause", async () => {
    const pipeline = createInteractionPipelineWithDefaults();
    registerInteractionPack(pipeline, PauseOncePack);
    const model = createModel("Paused hello");
    const input = { message: createMessage("Hi") };

    const paused = await runInteractionPipeline(pipeline, {
      input,
      adapters: { model },
    });

    expect(isPausedResult(paused)).toBe(true);
    if (!isPausedResult(paused)) {
      throw new Error("Expected paused pipeline result.");
    }
    expect(paused.snapshot.token).toBe(PAUSE_TOKEN);

    const runner = pipeline as {
      resume: (
        snapshot: unknown,
        resumeInput?: unknown,
      ) => InteractionRunOutcome | Promise<InteractionRunOutcome>;
    };
    const resumed = await runner.resume(paused.snapshot, { ok: true });

    expect(isPausedResult(resumed)).toBe(false);
    if (isPausedResult(resumed)) {
      throw new Error("Expected resumed pipeline result.");
    }
    const runResult = assertRunResult(resumed);
    expect(runResult.artifact.messages[1]?.content).toBe("Paused hello");
  });
});
