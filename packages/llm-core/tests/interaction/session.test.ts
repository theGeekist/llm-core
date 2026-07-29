import { describe, expect, it } from "bun:test";
import {
  createInteractionSession,
  type InteractionSessionPauseSnapshot,
  type InteractionState,
} from "#interaction";
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
    let mergedPrevious: InteractionState | null | undefined;

    function mergePolicy(previous: InteractionState | null, next: InteractionState) {
      mergedPrevious = previous;
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
    expect(mergedPrevious).toBeNull();
  });

  it("uses stored state when available", async () => {
    const harness = createMockSessionStore();
    const sessionId = { sessionId: "session-3", userId: "user-1" };
    const model = createMockModel("Hello again");

    harness.store.save({
      sessionId,
      state: createMockInteractionState([createMockMessage("Stored")]),
    });

    const session = createInteractionSession({
      sessionId,
      store: harness.store,
      adapters: { model },
    });

    const result = await session.send(createMockMessage("Next"));
    expect(assertRunResult(result).artefact.messages).toHaveLength(3);
    expect(session.getState().messages).toHaveLength(3);
  });

  it("keeps in-memory state at the last persisted value when save rejects", async () => {
    const previous = createMockInteractionState([createMockMessage("Stored")]);
    const session = createInteractionSession({
      sessionId: "session-save-error",
      store: {
        load: () => previous,
        save: () => Promise.reject(new Error("save failed")),
      },
      adapters: { model: createMockModel("Unsaved") },
    });

    await expect(session.send(createMockMessage("Next"))).rejects.toThrow("save failed");

    expect(session.getState()).toBe(previous);
    expect(session.getState().messages).toHaveLength(1);
  });

  it("keeps in-memory state unchanged when a synchronous save is not committed", () => {
    const previous = createMockInteractionState([createMockMessage("Stored")]);
    const session = createInteractionSession({
      sessionId: "session-save-false",
      store: {
        load: () => previous,
        save: () => false,
      },
      adapters: { model: createMockModel("Unsaved") },
    });

    expect(() => session.send(createMockMessage("Next"))).toThrow(
      "SessionStore.save did not commit session state.",
    );
    expect(session.getState()).toBe(previous);
  });

  it("keeps in-memory state unchanged when an asynchronous save is not committed", async () => {
    const previous = createMockInteractionState([createMockMessage("Stored")]);
    const session = createInteractionSession({
      sessionId: "session-save-null",
      store: {
        load: () => previous,
        save: () => Promise.resolve(null),
      },
      adapters: { model: createMockModel("Unsaved") },
    });

    await expect(session.send(createMockMessage("Next"))).rejects.toThrow(
      "SessionStore.save did not commit session state.",
    );
    expect(session.getState()).toBe(previous);
  });

  it("skips policy and save when paused", async () => {
    const harness = createMockSessionStore();
    const sessionId = "session-4";
    const model = createMockModel("Ignored");
    const steps: string[] = [];

    harness.store.save({
      sessionId,
      state: {
        messages: [],
        diagnostics: [],
        trace: [],
        private: { pause: { token: "pause-1", pauseKind: "human" } },
      },
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

  it("resumes a live snapshot through policy and persistence", async () => {
    const harness = createMockSessionStore();
    const sessionId = "session-resume";
    const steps: string[] = [];
    harness.store.save({
      sessionId,
      state: {
        messages: [],
        diagnostics: [],
        trace: [],
        private: { pause: { token: "pause-resume", pauseKind: "human" } },
      },
    });
    const session = createInteractionSession({
      sessionId,
      store: harness.store,
      adapters: { model: createMockModel("Resumed") },
      policy: {
        merge: (_previous, next) => {
          steps.push("merge");
          return next;
        },
        summarize: (state) => {
          steps.push("summarize");
          return state;
        },
        truncate: (state) => {
          steps.push("truncate");
          return state;
        },
      },
    });
    const paused = await session.send(createMockMessage("Pause"));
    if (!isPausedResult(paused)) {
      throw new Error("Expected paused session.");
    }

    const resumed = await session.resume({
      snapshot: paused.snapshot,
      resumeInput: { decision: "approve" },
    });

    expect(isPausedResult(resumed)).toBe(false);
    expect(steps).toEqual(["merge", "summarize", "truncate"]);
    expect(harness.calls.save).toBe(2);
    expect(harness.calls.load).toBe(2);
    expect(session.getState().messages).toHaveLength(2);
  });

  it("requires snapshots to identify the owning session", () => {
    const harness = createMockSessionStore();
    const session = createInteractionSession({
      sessionId: "session-owner",
      store: harness.store,
    });
    const snapshot = {
      stageIndex: 0,
      state: {},
      createdAt: 1,
    } as InteractionSessionPauseSnapshot;

    expect(() => session.resume({ snapshot })).toThrow("does not identify its owning session");
  });

  it("rejects snapshots issued for another session", () => {
    const harness = createMockSessionStore();
    const session = createInteractionSession({
      sessionId: "session-owner",
      store: harness.store,
    });
    const snapshot: InteractionSessionPauseSnapshot = {
      stageIndex: 0,
      state: {},
      createdAt: 1,
      interactionSession: { sessionId: "session-other" },
    };

    expect(() => session.resume({ snapshot })).toThrow("belongs to a different session");
  });

  it("preserves the live paused state when resume processing fails", () => {
    const harness = createMockSessionStore();
    const sessionId = "session-resume-failure";
    harness.store.save({
      sessionId,
      state: {
        messages: [createMockMessage("Stored")],
        diagnostics: [],
        trace: [],
        private: { pause: { token: "pause-failure", pauseKind: "human" } },
      },
    });
    const session = createInteractionSession({
      sessionId,
      store: harness.store,
      adapters: { model: createMockModel("Paused") },
      policy: {
        merge: () => {
          throw new Error("merge failed");
        },
      },
    });
    const paused = session.send(createMockMessage("Pause"));
    if (isPromiseLike(paused) || !isPausedResult(paused)) {
      throw new Error("Expected synchronous paused session.");
    }
    const pausedState = session.getState();

    expect(() => session.resume({ snapshot: paused.snapshot })).toThrow("merge failed");

    expect(session.getState()).toBe(pausedState);
    expect(session.getState().messages).toHaveLength(3);
    expect(session.getState().private?.pause).toBeUndefined();
  });
});
