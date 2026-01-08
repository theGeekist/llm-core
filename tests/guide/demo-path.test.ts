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
  type InteractionState,
  type SessionId,
} from "#interaction";
import { recipes } from "#recipes";
import { isPausedOutcome, readOutcomeState } from "../../src/interaction/handle";

type MaybePromise<T> = T | Promise<T>;

const resolveMaybe = async <T>(value: MaybePromise<T>): Promise<T> => {
  if (isPromiseLike(value)) {
    return value;
  }
  return Promise.resolve(value);
};

const createSessionStore = () => {
  const cache = new Map<string, InteractionState>();
  return {
    load(sessionId: SessionId) {
      return cache.get(toSessionKey(sessionId)) ?? null;
    },
    save(sessionId: SessionId, state: InteractionState) {
      cache.set(toSessionKey(sessionId), state);
      return true;
    },
  };
};

const toSessionKey = (sessionId: SessionId) =>
  typeof sessionId === "string" ? sessionId : sessionId.sessionId;

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
    const session = createInteractionSession({
      sessionId: "demo-session",
      store: createSessionStore(),
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
    const session = createInteractionSession({
      sessionId: "demo-ui",
      store: createSessionStore(),
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
