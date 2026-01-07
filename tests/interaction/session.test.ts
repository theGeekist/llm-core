import { describe, expect, it } from "bun:test";
import {
  createInteractionSession,
  type InteractionRunOutcome,
  type InteractionRunResult,
  type InteractionState,
  type SessionId,
} from "#interaction";
import type { Message, Model, ModelResult } from "#adapters";
import { isPromiseLike, type PipelinePaused } from "@wpkernel/pipeline/core";

type SessionStoreHarness = {
  store: {
    load: (sessionId: SessionId, context?: unknown) => InteractionState | null;
    save: (sessionId: SessionId, state: InteractionState, context?: unknown) => boolean;
  };
  sessions: Map<string, InteractionState>;
  calls: { load: number; save: number; contexts: unknown[] };
};

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

const createBaseState = (messages: Message[] = []): InteractionState => ({
  messages,
  diagnostics: [],
  trace: [],
});

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

const toSessionKey = (sessionId: SessionId) => {
  if (typeof sessionId === "string") {
    return sessionId;
  }
  return sessionId.userId ? `${sessionId.sessionId}:${sessionId.userId}` : sessionId.sessionId;
};

const createMemorySessionStore = (): SessionStoreHarness => {
  const sessions = new Map<string, InteractionState>();
  const calls = { load: 0, save: 0, contexts: [] as unknown[] };
  return {
    sessions,
    calls,
    store: {
      load: (sessionId, context) => {
        calls.load += 1;
        calls.contexts.push(context);
        return sessions.get(toSessionKey(sessionId)) ?? null;
      },
      save: (sessionId, state, context) => {
        calls.save += 1;
        calls.contexts.push(context);
        sessions.set(toSessionKey(sessionId), state);
        return true;
      },
    },
  };
};

describe("interaction session", () => {
  it("loads and saves session state", () => {
    const harness = createMemorySessionStore();
    const sessionId = "session-1";
    const model = createModel("Hello!");
    const context = {
      report: () => {},
    };

    const session = createInteractionSession({
      sessionId,
      store: harness.store,
      adapters: { model },
      context,
    });

    const result = session.send(createMessage("Hi"));

    expect(isPromiseLike(result)).toBe(false);
    if (isPromiseLike(result)) {
      throw new Error("Expected sync session result.");
    }
    expect(assertRunResult(result).artifact.messages).toHaveLength(2);
    expect(harness.sessions.get(sessionId)?.messages).toHaveLength(2);
    expect(harness.calls.load).toBe(1);
    expect(harness.calls.save).toBe(1);
    expect(harness.calls.contexts).toContain(context);
  });

  it("applies policy hooks in order", async () => {
    const harness = createMemorySessionStore();
    const model = createModel("Okay");
    const steps: string[] = [];

    function mergePolicy(previous: InteractionState | null, next: InteractionState) {
      void previous;
      steps.push("merge");
      return next;
    }

    function summarizePolicy(state: InteractionState) {
      steps.push("summarize");
      return state;
    }

    function truncatePolicy(state: InteractionState) {
      steps.push("truncate");
      return state;
    }

    const session = createInteractionSession({
      sessionId: "session-2",
      store: harness.store,
      adapters: { model },
      policy: {
        merge: mergePolicy,
        summarize: summarizePolicy,
        truncate: truncatePolicy,
      },
    });

    await session.send(createMessage("Hi"));

    expect(steps).toEqual(["merge", "summarize", "truncate"]);
  });

  it("uses stored state when available", async () => {
    const harness = createMemorySessionStore();
    const sessionId = { sessionId: "session-3", userId: "user-1" };
    const model = createModel("Hello again");

    harness.store.save(sessionId, createBaseState([createMessage("Stored")]));

    const session = createInteractionSession({
      sessionId,
      store: harness.store,
      adapters: { model },
    });

    const result = await session.send(createMessage("Next"));
    expect(assertRunResult(result).artifact.messages).toHaveLength(3);
    expect(session.getState().messages).toHaveLength(3);
  });

  it("skips policy and save when paused", async () => {
    const harness = createMemorySessionStore();
    const sessionId = "session-4";
    const model = createModel("Ignored");
    const steps: string[] = [];

    harness.store.save(sessionId, {
      messages: [],
      diagnostics: [],
      trace: [],
      private: { pause: { token: "pause-1", pauseKind: "human" } },
    });

    const session = createInteractionSession({
      sessionId,
      store: harness.store,
      adapters: { model },
      policy: {
        merge: (previous, next) => {
          void previous;
          steps.push("merge");
          return next;
        },
      },
    });

    const outcome = await session.send(createMessage("Pause"));

    expect(isPausedResult(outcome)).toBe(true);
    expect(steps).toHaveLength(0);
    expect(harness.calls.save).toBe(1);
    expect(session.getState().private?.pause).toBeUndefined();
  });
});
