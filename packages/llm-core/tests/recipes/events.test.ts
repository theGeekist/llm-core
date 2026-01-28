import { describe, expect, it } from "bun:test";
import type { AdapterTraceEvent, EventStream } from "../../src/adapters/types";
import { emitRecipeEvent, emitRecipeEvents, readRecipeEvents } from "../../src/recipes/events";
import { createDefaultReporter } from "../../src/workflow/extensions";
import type { PipelineContext, PipelineState } from "../../src/workflow/types";

const createContext = (eventStream?: EventStream): PipelineContext => ({
  reporter: createDefaultReporter(),
  adapters: eventStream ? { eventStream } : undefined,
});

const createState = (): PipelineState => ({});

const eventA: AdapterTraceEvent = { name: "recipe.event", data: { id: "a" } };
const eventB: AdapterTraceEvent = { name: "recipe.event", data: { id: "b" } };

describe("Recipe events", () => {
  it("returns an empty list when no events are present", () => {
    expect(readRecipeEvents(createState())).toEqual([]);
  });

  it("emits a single event and stores it in state", () => {
    const emitted: AdapterTraceEvent[] = [];
    const stream: EventStream = {
      emit: (event) => {
        emitted.push(event);
        return true;
      },
    };
    const state = createState();
    const result = emitRecipeEvent(createContext(stream), state, eventA);

    expect(result).toBe(true);
    expect(emitted).toEqual([eventA]);
    expect(readRecipeEvents(state)).toEqual([eventA]);
  });

  it("uses emitMany when provided", () => {
    const emitted: AdapterTraceEvent[] = [];
    const stream: EventStream = {
      emit: () => true,
      emitMany: (events) => {
        emitted.push(...events);
        return false;
      },
    };
    const state = createState();
    const result = emitRecipeEvents(createContext(stream), state, [eventA, eventB]);

    expect(result).toBe(false);
    expect(emitted).toEqual([eventA, eventB]);
    expect(readRecipeEvents(state)).toEqual([eventA, eventB]);
  });

  it("combines sequential emit results", () => {
    const stream: EventStream = {
      emit: (event) => (event === eventA ? true : false),
    };
    const state = createState();
    const result = emitRecipeEvents(createContext(stream), state, [eventA, eventB]);

    expect(result).toBe(false);
  });

  it("returns null when any emit result is unknown", () => {
    const stream: EventStream = {
      emit: (event) => (event === eventA ? null : true),
    };
    const state = createState();
    const result = emitRecipeEvents(createContext(stream), state, [eventA, eventB]);

    expect(result).toBeNull();
  });
});
