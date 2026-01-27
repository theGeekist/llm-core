import { describe, expect, it } from "bun:test";
import {
  createAiSdkInteractionEventStream,
  createAssistantUiInteractionEventStream,
  createBuiltinModel,
  createChatKitInteractionEventStream,
} from "#adapters";
import {
  createInteractionPipelineWithDefaults,
  createInteractionSession,
  runInteractionPipeline,
} from "#interaction";
import { isPromiseLike } from "@wpkernel/pipeline/core";
import { isPausedOutcome, readOutcomeState } from "../../src/interaction/handle";
import type { UIMessageStreamWriter, UIMessageChunk } from "ai";
import { createMockSessionStore } from "../fixtures/factories";

type MaybePromise<T> = T | Promise<T>;

const resolveMaybe = async <T>(value: MaybePromise<T>): Promise<T> =>
  isPromiseLike(value) ? value : Promise.resolve(value);

describe("Integration interaction demos", () => {
  it("runs the interaction pipeline with built-in model", async () => {
    const pipeline = createInteractionPipelineWithDefaults();
    const outcome = await resolveMaybe(
      runInteractionPipeline(pipeline, {
        input: { message: { role: "user", content: "Hello!" } },
        adapters: { model: createBuiltinModel() },
      }),
    );

    expect(isPausedOutcome(outcome)).toBe(false);
    const state = readOutcomeState(outcome);
    expect(state.messages.length).toBeGreaterThanOrEqual(2);
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

    const outcome = await resolveMaybe(
      session.send({ role: "user", content: "Hello from ai-sdk-ui" }),
    );

    const state = readOutcomeState(outcome);
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

    const outcome = await resolveMaybe(
      session.send({ role: "user", content: "Hello from assistant-ui" }),
    );

    const state = readOutcomeState(outcome);
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

    const outcome = await resolveMaybe(
      session.send({ role: "user", content: "Hello from chatkit" }),
    );

    const state = readOutcomeState(outcome);
    expect(state.messages.length).toBeGreaterThanOrEqual(2);
    expect(events.length).toBeGreaterThan(0);
  });
});
