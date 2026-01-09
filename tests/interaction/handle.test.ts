import { describe, expect, it } from "bun:test";
import {
  createInteractionHandle,
  type InteractionRunOutcome,
  type InteractionPauseRequest,
  type InteractionStepApply,
  type InteractionStepPack,
  type InteractionState,
} from "#interaction";
import { createEmptyState, readPausedState } from "../../src/interaction/handle";
import { isPromiseLike } from "@wpkernel/pipeline/core";
import { createMockModel, createMockMessage } from "../fixtures/factories";
import type { Message } from "#adapters";

const appendHint: InteractionStepApply = (options) => {
  const hintMessage: Message = {
    role: "assistant",
    content: "hint",
  };
  options.output.messages = [...options.output.messages, hintMessage];
  return { output: options.output };
};

const createHintPack = (): InteractionStepPack => ({
  name: "post-process",
  steps: [
    {
      name: "append-hint",
      apply: appendHint,
      dependsOn: ["interaction-core.run-model"],
    },
  ],
});

const pauseRequest: InteractionPauseRequest = {
  token: "pause-1",
  pauseKind: "human",
  payload: { reason: "test" },
};

const applyPause: InteractionStepApply = (options) => {
  const privateState = options.output.private ?? {};
  options.output.private = { ...privateState, pause: pauseRequest };
  return { output: options.output };
};

const createPausePack = (): InteractionStepPack => ({
  name: "pause-pack",
  steps: [
    {
      name: "request-pause",
      apply: applyPause,
      dependsOn: ["interaction-core.run-model"],
    },
  ],
});

const createPausedOutcome = (state: InteractionState): InteractionRunOutcome => ({
  __paused: true as const,
  snapshot: {
    token: "pause-token",
    pauseKind: "human",
    payload: { ok: true },
    createdAt: 1,
    stageIndex: 0,
    state: { userState: state },
  },
});

describe("interaction handle", () => {
  it("runs a chat turn with a flat input", () => {
    const handle = createInteractionHandle({ adapters: { model: createMockModel("hello") } });
    const result = handle.run({ message: createMockMessage("hi") });

    expect(isPromiseLike(result)).toBe(false);
    if (isPromiseLike(result)) {
      throw new Error("Expected sync handle result.");
    }

    expect(result.state.messages).toHaveLength(2);
    expect(result.state.messages[1]?.content).toBe("hello");
  });

  it("surfaces captured events when requested", () => {
    const handle = createInteractionHandle({ adapters: { model: createMockModel("hello") } });
    const result = handle.run({ message: createMockMessage("hi") }, { captureEvents: true });

    expect(isPromiseLike(result)).toBe(false);
    if (isPromiseLike(result)) {
      throw new Error("Expected sync handle result.");
    }

    expect(result.events).toBeArray();
    expect(result.events && result.events.length > 0).toBe(true);
  });

  it("prefers explicit state over captureEvents defaults", () => {
    const handle = createInteractionHandle({ adapters: { model: createMockModel("hello") } });
    const initialState: InteractionState = {
      messages: [createMockMessage("seed")],
      diagnostics: [],
      trace: [],
    };
    const result = handle.run(
      { message: createMockMessage("hi"), state: initialState },
      { captureEvents: true },
    );

    expect(isPromiseLike(result)).toBe(false);
    if (isPromiseLike(result)) {
      throw new Error("Expected sync handle result.");
    }

    expect(result.state.events).toBeUndefined();
    expect(result.state.messages[0]?.content).toBe("seed");
  });

  it("supports packs and exposes a plan", () => {
    const handle = createInteractionHandle({ adapters: { model: createMockModel("hello") } }).use(
      createHintPack(),
    );
    const plan = handle.explain();
    const result = handle.run({ message: createMockMessage("hi") });

    expect(plan.steps.some((step) => step.id === "post-process.append-hint")).toBe(true);
    expect(isPromiseLike(result)).toBe(false);
    if (isPromiseLike(result)) {
      throw new Error("Expected sync handle result.");
    }
    expect(result.state.messages[2]?.content).toBe("hint");
  });

  it("applies configured defaults when building handles", () => {
    const handle = createInteractionHandle({
      adapters: { model: createMockModel("base") },
    }).configure({
      adapters: { model: createMockModel("configured") },
    });
    const result = handle.run({ message: createMockMessage("hi") });

    expect(isPromiseLike(result)).toBe(false);
    if (isPromiseLike(result)) {
      throw new Error("Expected sync handle result.");
    }

    expect(result.state.messages[1]?.content).toBe("configured");
  });

  it("merges defaults after creation", () => {
    const handle = createInteractionHandle({
      adapters: { model: createMockModel("base") },
    }).defaults({
      adapters: { model: createMockModel("default") },
    });
    const result = handle.run({ message: createMockMessage("hi") });

    expect(isPromiseLike(result)).toBe(false);
    if (isPromiseLike(result)) {
      throw new Error("Expected sync handle result.");
    }

    expect(result.state.messages[1]?.content).toBe("default");
  });

  it("merges defaults from other handles", () => {
    const base = createInteractionHandle({ adapters: { model: createMockModel("base") } });
    const override = createInteractionHandle({ adapters: { model: createMockModel("override") } });
    const handle = base.use(override);
    const result = handle.run({ message: createMockMessage("hi") });

    expect(isPromiseLike(result)).toBe(false);
    if (isPromiseLike(result)) {
      throw new Error("Expected sync handle result.");
    }

    expect(result.state.messages[1]?.content).toBe("override");
  });

  it("ignores non-pack inputs for use()", () => {
    const handle = createInteractionHandle({ adapters: { model: createMockModel("base") } }).use(
      {} as InteractionStepPack,
    );
    const result = handle.run({ message: createMockMessage("hi") });

    expect(isPromiseLike(result)).toBe(false);
    if (isPromiseLike(result)) {
      throw new Error("Expected sync handle result.");
    }

    expect(result.state.messages[1]?.content).toBe("base");
  });

  it("returns state snapshots for paused runs", () => {
    const handle = createInteractionHandle({ adapters: { model: createMockModel("hello") } }).use(
      createPausePack(),
    );
    const result = handle.run({ message: createMockMessage("hi") });

    expect(isPromiseLike(result)).toBe(false);
    if (isPromiseLike(result)) {
      throw new Error("Expected sync handle result.");
    }

    expect(result.state.messages).toHaveLength(2);
    expect(result.state.messages[1]?.content).toBe("hello");
  });

  it("returns empty state when paused snapshots lack user state", () => {
    const paused = createPausedOutcome(createEmptyState());
    const state = readPausedState(paused as never);
    expect(state).toEqual(createEmptyState());
  });
});
