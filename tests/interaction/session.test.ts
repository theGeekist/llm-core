import { describe, expect, it } from "bun:test";
import { createInteractionSession, type InteractionState } from "#interaction";
import {
  createMockModel,
  createMockMessage,
  createMockSessionStore,
  createMockInteractionState,
} from "../fixtures/factories";
import { assertRunResult, isPausedResult } from "./test-utils";
import { isPromiseLike } from "@wpkernel/pipeline/core";

describe("interaction session", () => {
  it("loads and saves session state", () => {
    const harness = createMockSessionStore();
    const sessionId = "session-1";
    const model = createMockModel("Hello!");
    const context = {
      report: () => {},
    };

    const session = createInteractionSession({
      sessionId,
      store: harness.store,
      adapters: { model },
      context,
    });

    const result = session.send(createMockMessage("Hi"));

    expect(isPromiseLike(result)).toBe(false);
    if (isPromiseLike(result)) {
      throw new Error("Expected sync session result.");
    }
    expect(assertRunResult(result).artefact.messages).toHaveLength(2);
    expect(harness.sessions.get(sessionId)?.messages).toHaveLength(2);
    expect(harness.calls.load).toBe(1);
    expect(harness.calls.save).toBe(1);
    expect(harness.calls.contexts).toContain(context);
  });

  it("applies policy hooks in order", async () => {
    const harness = createMockSessionStore();
    const model = createMockModel("Okay");
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

    await session.send(createMockMessage("Hi"));

    expect(steps).toEqual(["merge", "summarize", "truncate"]);
  });

  it("uses stored state when available", async () => {
    const harness = createMockSessionStore();
    const sessionId = { sessionId: "session-3", userId: "user-1" };
    const model = createMockModel("Hello again");

    harness.store.save(sessionId, createMockInteractionState([createMockMessage("Stored")]));

    const session = createInteractionSession({
      sessionId,
      store: harness.store,
      adapters: { model },
    });

    const result = await session.send(createMockMessage("Next"));
    expect(assertRunResult(result).artefact.messages).toHaveLength(3);
    expect(session.getState().messages).toHaveLength(3);
  });

  it("skips policy and save when paused", async () => {
    const harness = createMockSessionStore();
    const sessionId = "session-4";
    const model = createMockModel("Ignored");
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

    const outcome = await session.send(createMockMessage("Pause"));

    expect(isPausedResult(outcome)).toBe(true);
    expect(steps).toHaveLength(0);
    expect(harness.calls.save).toBe(1);
    expect(session.getState().private?.pause).toBeUndefined();
  });
});
