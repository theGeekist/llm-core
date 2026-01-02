import { describe, expect, it } from "bun:test";
import type { EventStream } from "#adapters";
import type { InteractionEvent } from "#interaction";
import { emitInteractionEvent, emitInteractionEvents, toEventStreamEvent } from "#interaction";

const createEvent = (): InteractionEvent => ({
  kind: "diagnostic",
  entry: {
    level: "warn",
    kind: "workflow",
    message: "example",
  },
  meta: {
    sequence: 1,
    timestamp: Date.now(),
    sourceId: "interaction",
  },
});

describe("interaction transport", () => {
  it("wraps interaction events in event stream payloads", () => {
    const event = createEvent();
    const mapped = toEventStreamEvent(event);
    expect(mapped.name).toBe("interaction.diagnostic");
    expect(mapped.data?.event).toBe(event);
  });

  it("emits a single interaction event", () => {
    let received: unknown;
    const stream: EventStream = {
      emit: (event) => {
        received = event;
        return true;
      },
    };
    const event = createEvent();
    const result = emitInteractionEvent(stream, event);
    expect(result).toBe(true);
    expect((received as { name: string }).name).toBe("interaction.diagnostic");
  });

  it("emits events using emitMany when available", () => {
    let received: unknown[] = [];
    const stream: EventStream = {
      emit: () => false,
      emitMany: (events) => {
        received = events;
        return true;
      },
    };
    const events = [createEvent(), createEvent()];
    const result = emitInteractionEvents(stream, events);
    expect(result).toBe(true);
    expect(received).toHaveLength(2);
  });

  it("falls back to emit when emitMany is missing", () => {
    const received: string[] = [];
    const stream: EventStream = {
      emit: (event) => {
        received.push(event.name);
        return event.name === "interaction.diagnostic";
      },
    };
    const events = [createEvent(), createEvent()];
    const result = emitInteractionEvents(stream, events);
    expect(result).toBe(true);
    expect(received).toEqual(["interaction.diagnostic", "interaction.diagnostic"]);
  });
});
