import { describe, expect, it } from "bun:test";
import type { InteractionPauseRequest, InteractionState } from "#interaction";
import {
  applyPauseStage,
  clearPauseRequest,
  readPauseRequest,
  toPauseOptions,
} from "../../src/interaction/pipeline";
import { createEmptyState } from "../../src/interaction/handle";
import {
  applyRunModelCore,
  applyCaptureInput,
  mergeInteractionPrivate,
  requestInteractionPause,
  readMessageText,
  readResultText,
} from "../../src/interaction/steps";
import {
  emitInteraction,
  emitInteractionEventsForContext,
} from "../../src/interaction/event-utils";
import type { EventStream, Message, ModelResult } from "#adapters";

const createState = (): InteractionState => ({
  messages: [],
  diagnostics: [],
  trace: [],
});

const createPauseRequest = (): InteractionPauseRequest => ({
  token: "pause-token",
  pauseKind: "human",
  payload: { reason: "test" },
});

const createMessage = (content: Message["content"]): Message => ({
  role: "assistant",
  content,
});

const createContext = (eventStream?: EventStream) => ({
  reporter: {},
  adapters: undefined,
  reducer: (state: InteractionState, _event: unknown) => state,
  eventStream,
});

const createEventStream = (): EventStream => ({
  emit: () => true,
});

const createPausedResult = (state: { userState: InteractionState }) => ({
  __paused: true as const,
  snapshot: {
    token: "pause-token",
    pauseKind: "human",
    payload: { reason: "test" },
    createdAt: 1,
    stageIndex: 0,
    state,
  },
});

describe("interaction helpers", () => {
  it("reads and clears pause requests", () => {
    const pause = createPauseRequest();
    const state: InteractionState = {
      ...createState(),
      private: { pause },
    };
    expect(readPauseRequest(state)).toEqual(pause);
    const cleared = clearPauseRequest(state);
    expect(readPauseRequest(cleared)).toBeNull();
  });

  it("preserves state when clearing without pause request", () => {
    const state = createState();
    expect(clearPauseRequest(state)).toBe(state);
  });

  it("returns pause options from pause requests", () => {
    const pause = createPauseRequest();
    const options = toPauseOptions(pause);
    expect(options).toEqual({
      token: pause.token,
      pauseKind: pause.pauseKind,
      payload: pause.payload,
    });
  });

  it("does not pause when no request is present", () => {
    const state = createState();
    const result = applyPauseStage({ runnerEnv: {} } as never, { userState: state });
    expect(result).toEqual({ userState: state });
  });

  it("does not pause when runner env lacks pause", () => {
    const pause = createPauseRequest();
    const state: InteractionState = {
      ...createState(),
      private: { pause },
    };
    const result = applyPauseStage({ runnerEnv: {} } as never, { userState: state });
    expect(result).toEqual({ userState: state });
  });

  it("pauses and clears pause requests when configured", () => {
    const pause = createPauseRequest();
    const state: InteractionState = {
      ...createState(),
      private: { pause, raw: { touched: true } },
    };
    let capturedState: InteractionState | null = null;
    const runnerEnv = {
      pause: (nextState: { userState: InteractionState }) => {
        capturedState = nextState.userState;
        return createPausedResult(nextState);
      },
    };
    const result = applyPauseStage({ runnerEnv } as never, { userState: state });
    if (capturedState === null) {
      throw new Error("Expected pause handler to capture state.");
    }
    const confirmedState: InteractionState = capturedState;
    expect(result).toEqual(createPausedResult({ userState: confirmedState }));
    expect(confirmedState.private?.pause).toBeUndefined();
    expect(confirmedState.private?.raw).toEqual({ touched: true });
  });

  it("merges interaction private state and pause requests", () => {
    const pause = createPauseRequest();
    const state: InteractionState = {
      ...createState(),
      private: { raw: { seed: true } },
    };
    const merged = mergeInteractionPrivate(state, { pause });
    expect(merged.private?.raw).toEqual({ seed: true });
    expect(merged.private?.pause).toEqual(pause);
    const paused = requestInteractionPause(pause, state);
    expect(paused.private?.pause).toEqual(pause);
  });

  it("skips capture input when no message is provided", () => {
    const state = createState();
    const result = applyCaptureInput({
      input: {},
      output: state,
      context: createContext(),
    } as never);
    expect(result).toEqual({ output: state });
  });

  it("reads message text from string or structured content", () => {
    expect(readMessageText(createMessage("plain"))).toBe("plain");
    expect(readMessageText(createMessage({ text: "structured", parts: [] }))).toBe("structured");
  });

  it("reads result text with fallbacks", () => {
    const empty: ModelResult = {};
    const fromMessages: ModelResult = {
      messages: [createMessage({ text: "message text", parts: [] })],
    };
    expect(readResultText(empty)).toBeNull();
    expect(readResultText({ text: "explicit" })).toBe("explicit");
    expect(readResultText(fromMessages)).toBe("message text");
  });

  it("emits interaction events only when event stream is present", () => {
    const context = createContext();
    const event = { kind: "model", event: { type: "start" }, meta: { sequence: 1 } } as never;
    expect(emitInteraction(context, event)).toBeNull();
    expect(emitInteractionEventsForContext(context, [event])).toBeNull();
    const streamContext = createContext(createEventStream());
    expect(emitInteraction(streamContext, event)).toBe(true);
    expect(emitInteractionEventsForContext(streamContext, [event])).toBe(true);
  });

  it("returns state when no model adapter is available", () => {
    const state = createState();
    const input = { message: createMessage("hi") };
    const result = applyRunModelCore(state, createContext(), input);
    expect(result).toBe(state);
  });

  it("creates empty interaction state defaults", () => {
    expect(createEmptyState()).toEqual({
      messages: [],
      diagnostics: [],
      trace: [],
    });
  });
});
