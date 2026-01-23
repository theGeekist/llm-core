import { describe, expect, it } from "bun:test";
import type {
  EventStream,
  EventStreamEvent,
  Message,
  Retriever,
  RetrievalResult,
  RetrievalQuery,
} from "#adapters";
import {
  runInteractionRequest,
  resolveInteractionRecipeId,
  hasRecipeId,
} from "../../src/interaction/request";
import { createMockModel, createMockMessage } from "../fixtures/factories";
import { bindFirst } from "../../src/shared/fp";

type RecordedEventStream = {
  events: EventStreamEvent[];
  stream: EventStream;
};

const recordEvent = (events: EventStreamEvent[], event: EventStreamEvent) => {
  events.push(event);
  return true;
};

const recordEventWithResult = (
  input: { events: EventStreamEvent[]; result: boolean | null },
  event: EventStreamEvent,
) => {
  input.events.push(event);
  return input.result;
};

const createEventStreamRecorder = (): RecordedEventStream => {
  const events: EventStreamEvent[] = [];
  return {
    events,
    stream: {
      emit: bindFirst(recordEvent, events),
    },
  };
};

const createEventStreamRecorderWithResult = (result: boolean | null): RecordedEventStream => {
  const events: EventStreamEvent[] = [];
  return {
    events,
    stream: {
      emit: bindFirst(recordEventWithResult, { events, result }),
    },
  };
};

const createMessages = (text: string): Message[] => [createMockMessage(text, "user")];

const hasDiagnosticEvent = (events: EventStreamEvent[]) => {
  for (const event of events) {
    if (event.name !== "interaction.diagnostic") {
      continue;
    }
    return true;
  }
  return false;
};

const findInteractionEvent = (events: EventStreamEvent[], name: string) => {
  for (const event of events) {
    if (event.name === name) {
      return event;
    }
  }
  return null;
};

const readInteractionMeta = (event: EventStreamEvent | null) => {
  if (!event || typeof event.data !== "object" || !event.data) {
    return null;
  }
  const record = event.data as { event?: { meta?: unknown } };
  if (!record.event || typeof record.event !== "object") {
    return null;
  }
  const meta = (record.event as { meta?: unknown }).meta;
  return meta && typeof meta === "object" ? meta : null;
};

const createDiagnosticRetriever = (): Retriever => ({
  retrieve: (
    query: RetrievalQuery | undefined,
    context?: { report?: (entry: unknown) => void },
  ) => {
    context?.report?.({ level: "warn", message: "test diag" });
    const result: RetrievalResult = { query, documents: [] };
    return result;
  },
});

describe("interaction request helper", () => {
  it("returns null when no user message is present", () => {
    const model = createMockModel("ok");
    const recorder = createEventStreamRecorder();
    const result = runInteractionRequest({
      recipeId: "chat.simple",
      model,
      messages: [{ role: "assistant", content: "hi" }],
      eventStream: recorder.stream,
      interactionId: "interaction-1",
    });

    expect(result).toBeNull();
  });

  it("runs a chat recipe when user text is provided", async () => {
    const model = createMockModel("hello");
    const recorder = createEventStreamRecorder();
    const result = await runInteractionRequest({
      recipeId: "chat.simple",
      model,
      messages: createMessages("hello"),
      eventStream: recorder.stream,
      interactionId: "interaction-2",
    });

    expect(result?.status).toBe("ok");
  });

  it("reads object message content", async () => {
    const model = createMockModel("hello");
    const recorder = createEventStreamRecorder();
    const result = await runInteractionRequest({
      recipeId: "chat.simple",
      model,
      messages: [{ role: "user", content: { text: "hello", parts: [] } }],
      eventStream: recorder.stream,
      interactionId: "interaction-3",
    });

    expect(result?.status).toBe("ok");
  });

  it("reads array message content", async () => {
    const model = createMockModel("hello");
    const recorder = createEventStreamRecorder();
    const result = await runInteractionRequest({
      recipeId: "chat.simple",
      model,
      messages: [
        { role: "user", content: { text: "hello", parts: [{ type: "text", text: "hello" }] } },
      ],
      eventStream: recorder.stream,
      interactionId: "interaction-4",
    });

    expect(result?.status).toBe("ok");
  });

  it("reads array-shaped message content", async () => {
    const model = createMockModel("hello");
    const arrayContent = [{ type: "text", text: "hello" }] as unknown as Message["content"];
    const recorder = createEventStreamRecorder();
    const result = await runInteractionRequest({
      recipeId: "chat.simple",
      model,
      messages: [{ role: "user", content: arrayContent }],
      eventStream: recorder.stream,
      interactionId: "interaction-5",
    });

    expect(result?.status).toBe("ok");
  });

  it("reads string parts in array-shaped message content", async () => {
    const model = createMockModel("hello");
    const arrayContent = ["hello"] as unknown as Message["content"];
    const recorder = createEventStreamRecorder();
    const result = await runInteractionRequest({
      recipeId: "chat.simple",
      model,
      messages: [{ role: "user", content: arrayContent }],
      eventStream: recorder.stream,
      interactionId: "interaction-5b",
    });

    expect(result?.status).toBe("ok");
  });

  it("reads object parts in array-shaped message content", async () => {
    const model = createMockModel("hello");
    const arrayContent = [{ text: "hello" }] as unknown as Message["content"];
    const recorder = createEventStreamRecorder();
    const result = await runInteractionRequest({
      recipeId: "chat.simple",
      model,
      messages: [{ role: "user", content: arrayContent }],
      eventStream: recorder.stream,
      interactionId: "interaction-5c",
    });

    expect(result?.status).toBe("ok");
  });

  it("returns null when user text is blank", () => {
    const model = createMockModel("ok");
    const recorder = createEventStreamRecorder();
    const result = runInteractionRequest({
      recipeId: "chat.simple",
      model,
      messages: createMessages("   "),
      eventStream: recorder.stream,
      interactionId: "interaction-blank",
    });

    expect(result).toBeNull();
  });

  it("emits diagnostics when required capabilities are missing", async () => {
    const model = createMockModel("hello");
    const recorder = createEventStreamRecorder();
    const result = await runInteractionRequest({
      recipeId: "rag",
      model,
      adapters: { retriever: createDiagnosticRetriever() },
      messages: createMessages("hello"),
      eventStream: recorder.stream,
      interactionId: "interaction-6",
    });

    expect(result?.status).toBe("ok");
    expect(hasDiagnosticEvent(recorder.events)).toBe(true);
  });

  it("preserves correlation ids in emitted events", async () => {
    const model = createMockModel("hello");
    const recorder = createEventStreamRecorder();
    const result = await runInteractionRequest({
      recipeId: "rag",
      model,
      adapters: { retriever: createDiagnosticRetriever() },
      messages: createMessages("hello"),
      eventStream: recorder.stream,
      interactionId: "interaction-7",
      correlationId: "corr-7",
    });

    expect(result?.status).toBe("ok");
    const diagnosticEvent = findInteractionEvent(recorder.events, "interaction.diagnostic");
    const meta = readInteractionMeta(diagnosticEvent);
    if (!meta) {
      throw new Error("Expected diagnostic event metadata.");
    }
    const record = meta as { correlationId?: string };
    expect(record.correlationId).toBe("corr-7");
  });

  it("runs rag recipes with retriever adapters", async () => {
    const model = createMockModel("answer");
    const recorder = createEventStreamRecorder();
    const retriever = { retrieve: () => ({ query: "q", documents: [] }) };
    const result = await runInteractionRequest({
      recipeId: "rag",
      model,
      adapters: { retriever },
      messages: createMessages("hello"),
      eventStream: recorder.stream,
      interactionId: "interaction-rag",
    });

    expect(result?.status).toBe("ok");
  });

  it("pauses hitl recipes by default", async () => {
    const model = createMockModel("ok");
    const recorder = createEventStreamRecorder();
    const result = await runInteractionRequest({
      recipeId: "hitl",
      model,
      messages: createMessages("needs approval"),
      eventStream: recorder.stream,
      interactionId: "interaction-hitl",
    });

    expect(result?.status).toBe("paused");
  });

  it("handles diagnostic emission results returning false", async () => {
    const model = createMockModel("hello");
    const recorder = createEventStreamRecorderWithResult(false);
    const result = await runInteractionRequest({
      recipeId: "rag",
      model,
      adapters: { retriever: createDiagnosticRetriever() },
      messages: createMessages("hello"),
      eventStream: recorder.stream,
      interactionId: "interaction-8",
    });

    expect(result?.status).toBe("ok");
    expect(hasDiagnosticEvent(recorder.events)).toBe(true);
  });

  it("handles diagnostic emission results returning null", async () => {
    const model = createMockModel("hello");
    const recorder = createEventStreamRecorderWithResult(null);
    const result = await runInteractionRequest({
      recipeId: "rag",
      model,
      adapters: { retriever: createDiagnosticRetriever() },
      messages: createMessages("hello"),
      eventStream: recorder.stream,
      interactionId: "interaction-9",
    });

    expect(result?.status).toBe("ok");
    expect(hasDiagnosticEvent(recorder.events)).toBe(true);
  });

  it("normalizes unknown recipe ids", () => {
    expect(resolveInteractionRecipeId("unknown")).toBe("chat.simple");
    expect(hasRecipeId("chat.simple")).toBe(true);
    expect(hasRecipeId("unknown")).toBe(false);
  });
});
