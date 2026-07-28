import { describe, expect, it } from "bun:test";
import {
  createAiSdkInteractionEventStream,
  createAssistantUiInteractionEventStream,
  createBuiltinModel,
  createChatKitInteractionEventStream,
} from "#adapters";
import { createInteractionHandle, createInteractionSession } from "#interaction";
import { isPromiseLike } from "@wpkernel/pipeline/core";
import type { UIMessageStreamWriter, UIMessageChunk } from "ai";
import { createMockSessionStore } from "../fixtures/factories";

type MaybePromise<T> = T | Promise<T>;

const resolveMaybe = async <T>(value: MaybePromise<T>): Promise<T> =>
  isPromiseLike(value) ? value : Promise.resolve(value);

describe("Integration interaction demos", () => {
  it("runs the interaction pipeline with built-in model", async () => {
    const interaction = createInteractionHandle({
      adapters: { model: createBuiltinModel() },
    });
    const result = await resolveMaybe(
      interaction.run({ message: { role: "user", content: "Hello!" } }),
    );

    expect(result.state.messages.length).toBeGreaterThanOrEqual(2);
  });

  it("streams interaction events through the AI SDK UI adapter", async () => {
    const chunks: UIMessageChunk[] = [];
    const writer: UIMessageStreamWriter = {
      onError: undefined,
      write(chunk) {
        chunks.push(chunk);
      },
      merge() {},
    };
    const eventStream = createAiSdkInteractionEventStream({ writer });
    const session = createInteractionSession({
      sessionId: "ai-sdk-ui",
      store: createMockSessionStore().store,
      adapters: { model: createBuiltinModel() },
      eventStream,
    });

    await resolveMaybe(session.send({ role: "user", content: "Hello from ai-sdk-ui" }));

    const state = session.getState();
    expect(state.messages.length).toBeGreaterThanOrEqual(2);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("streams interaction events through the assistant-ui adapter", async () => {
    const commands: unknown[] = [];
    const eventStream = createAssistantUiInteractionEventStream({
      sendCommand(command) {
        commands.push(command);
      },
    });
    const session = createInteractionSession({
      sessionId: "assistant-ui",
      store: createMockSessionStore().store,
      adapters: { model: createBuiltinModel() },
      eventStream,
    });

    await resolveMaybe(session.send({ role: "user", content: "Hello from assistant-ui" }));

    const state = session.getState();
    expect(state.messages.length).toBeGreaterThanOrEqual(2);
    expect(commands.length).toBeGreaterThan(0);
  });

  it("streams interaction events through the ChatKit adapter", async () => {
    const events: unknown[] = [];
    const eventStream = createChatKitInteractionEventStream({
      dispatchEvent(event) {
        events.push(event);
      },
    });
    const session = createInteractionSession({
      sessionId: "chatkit",
      store: createMockSessionStore().store,
      adapters: { model: createBuiltinModel() },
      eventStream,
    });

    await resolveMaybe(session.send({ role: "user", content: "Hello from chatkit" }));

    const state = session.getState();
    expect(state.messages.length).toBeGreaterThanOrEqual(2);
    expect(events.length).toBeGreaterThan(0);
  });
});
