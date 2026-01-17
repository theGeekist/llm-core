import { describe, expect, it } from "bun:test";
import type { EventStream, Message } from "#adapters";
import {
  runInteractionRequest,
  resolveInteractionRecipeId,
  hasRecipeId,
} from "../../src/interaction/request";
import { createMockModel, createMockMessage } from "../fixtures/factories";

const createEventStream = (): EventStream => ({
  emit: () => true,
});

const createMessages = (text: string): Message[] => [createMockMessage(text, "user")];

describe("interaction request helper", () => {
  it("returns null when no user message is present", () => {
    const model = createMockModel("ok");
    const result = runInteractionRequest({
      recipeId: "chat.simple",
      model,
      messages: [{ role: "assistant", content: "hi" }],
      eventStream: createEventStream(),
      interactionId: "interaction-1",
    });

    expect(result).toBeNull();
  });

  it("runs a chat recipe when user text is provided", async () => {
    const model = createMockModel("hello");
    const result = await runInteractionRequest({
      recipeId: "chat.simple",
      model,
      messages: createMessages("hello"),
      eventStream: createEventStream(),
      interactionId: "interaction-2",
    });

    expect(result?.status).toBe("ok");
  });

  it("reads object message content", async () => {
    const model = createMockModel("hello");
    const result = await runInteractionRequest({
      recipeId: "chat.simple",
      model,
      messages: [{ role: "user", content: { text: "hello", parts: [] } }],
      eventStream: createEventStream(),
      interactionId: "interaction-3",
    });

    expect(result?.status).toBe("ok");
  });

  it("reads array message content", async () => {
    const model = createMockModel("hello");
    const result = await runInteractionRequest({
      recipeId: "chat.simple",
      model,
      messages: [
        { role: "user", content: { text: "hello", parts: [{ type: "text", text: "hello" }] } },
      ],
      eventStream: createEventStream(),
      interactionId: "interaction-4",
    });

    expect(result?.status).toBe("ok");
  });

  it("reads array-shaped message content", async () => {
    const model = createMockModel("hello");
    const arrayContent = [{ type: "text", text: "hello" }] as unknown as Message["content"];
    const result = await runInteractionRequest({
      recipeId: "chat.simple",
      model,
      messages: [{ role: "user", content: arrayContent }],
      eventStream: createEventStream(),
      interactionId: "interaction-5",
    });

    expect(result?.status).toBe("ok");
  });

  it("normalizes unknown recipe ids", () => {
    expect(resolveInteractionRecipeId("unknown")).toBe("chat.simple");
    expect(hasRecipeId("chat.simple")).toBe(true);
    expect(hasRecipeId("unknown")).toBe(false);
  });
});
