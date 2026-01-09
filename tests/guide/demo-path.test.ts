import { describe, expect, it } from "bun:test";
import { isPromiseLike } from "@wpkernel/pipeline/core";
import {
  createAssistantUiInteractionEventStream,
  createBuiltinModel,
  createBuiltinRetriever,
  type EventStreamEvent,
} from "#adapters";
import {
  createInteractionPipelineWithDefaults,
  createInteractionSession,
  runInteractionPipeline,
} from "#interaction";
import { recipes } from "#recipes";
import { isPausedOutcome, readOutcomeState } from "../../src/interaction/handle";
import { createMockSessionStore } from "../fixtures/factories";

type MaybePromise<T> = T | Promise<T>;

const resolveMaybe = async <T>(value: MaybePromise<T>): Promise<T> => {
  if (isPromiseLike(value)) {
    return value;
  }
  return Promise.resolve(value);
};

describe("demo path", () => {
  it("runs the single-turn interaction demo", async () => {
    const model = createBuiltinModel();
    const pipeline = createInteractionPipelineWithDefaults();
    const outcome = await resolveMaybe(
      runInteractionPipeline(pipeline, {
        input: { message: { role: "user", content: "Hello!" } },
        adapters: { model },
      }),
    );

    expect(isPausedOutcome(outcome)).toBe(false);
    const state = readOutcomeState(outcome);
    expect(state.messages.length).toBeGreaterThanOrEqual(2);
  });

  it("runs the sessions + transport demo", async () => {
    const events: EventStreamEvent[] = [];
    const eventStream = {
      emit(event: EventStreamEvent) {
        events.push(event);
        return true;
      },
    };
    const { store } = createMockSessionStore();
    const session = createInteractionSession({
      sessionId: "demo-session",
      store,
      adapters: { model: createBuiltinModel() },
      eventStream,
    });

    const outcome = await resolveMaybe(
      session.send({ role: "user", content: "Hello from sessions" }),
    );

    const state = readOutcomeState(outcome);
    expect(state.messages.length).toBeGreaterThanOrEqual(2);
    expect(events.length).toBeGreaterThan(0);
  });

  it("runs the end-to-end UI demo with assistant-ui commands", async () => {
    const commands: unknown[] = [];
    const eventStream = createAssistantUiInteractionEventStream({
      sendCommand(command) {
        commands.push(command);
      },
    });
    const { store } = createMockSessionStore();
    const session = createInteractionSession({
      sessionId: "demo-session-2",
      store,
      adapters: { model: createBuiltinModel() },
      eventStream,
    });

    const outcome = await resolveMaybe(session.send({ role: "user", content: "Show UI output" }));

    const state = readOutcomeState(outcome);
    expect(state.messages.length).toBeGreaterThanOrEqual(2);
    expect(commands.length).toBeGreaterThan(0);
  });

  it("runs the workflow orchestration demo with HITL pause", async () => {
    const documents = [
      { id: "doc-1", text: "llm-core uses recipes, adapters, and workflows." },
      { id: "doc-2", text: "Interactions project streams into UI-ready state." },
    ];
    const workflow = recipes
      .agent()
      .use(recipes.rag())
      .use(recipes.hitl())
      .defaults({
        adapters: {
          model: createBuiltinModel(),
          retriever: createBuiltinRetriever(documents),
        },
      })
      .build();

    const outcome = await resolveMaybe(
      workflow.run({ input: "Summarize the docs and request approval." }),
    );

    expect(outcome.status).toBe("paused");
    if (outcome.status !== "paused") {
      throw new Error("Expected HITL to pause the workflow.");
    }
    expect(outcome.token).toBeString();
  });
});
