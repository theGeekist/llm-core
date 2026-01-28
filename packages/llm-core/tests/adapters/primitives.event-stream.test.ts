import { describe, expect, it } from "bun:test";
import {
  createEventStreamFanout,
  createEventStreamFromTraceSink,
  createInteractionEventEmitterStream,
} from "#adapters";
import type { EventStreamEvent } from "#adapters";
import type { InteractionEvent } from "#interaction";

const toInteractionEvent = (event: InteractionEvent): EventStreamEvent => ({
  name: "interaction.test",
  data: { event },
});

const createTraceEvent = (name = "trace.demo"): EventStreamEvent => ({
  name,
  data: { ok: true },
});

describe("EventStream primitives", () => {
  it("fans out events to multiple sinks", async () => {
    const sinkA: EventStreamEvent[] = [];
    const sinkB: EventStreamEvent[] = [];

    const fanout = createEventStreamFanout([
      {
        emit(event) {
          sinkA.push(event);
          return true;
        },
      },
      {
        emit(event) {
          sinkB.push(event);
          return true;
        },
      },
    ]);

    const event = createTraceEvent();
    const result = await fanout.emit(event);

    expect(result).toBe(true);
    expect(sinkA).toEqual([event]);
    expect(sinkB).toEqual([event]);
  });

  it("returns null when fanout has no streams", async () => {
    const fanout = createEventStreamFanout([]);
    const event = createTraceEvent();

    const single = await fanout.emit(event);
    const many = await fanout.emitMany?.([event]);

    expect(single).toBeNull();
    expect(many).toBeNull();
  });

  it("returns false when any fanout stream fails", async () => {
    const fanout = createEventStreamFanout([
      {
        emit() {
          return true;
        },
      },
      {
        emit() {
          return false;
        },
      },
    ]);

    const result = await fanout.emit(createTraceEvent());

    expect(result).toBe(false);
  });

  it("propagates unknown results through fanout", async () => {
    const fanout = createEventStreamFanout([
      {
        emit() {
          return true;
        },
      },
      {
        emit() {
          return null;
        },
      },
    ]);

    const result = await fanout.emit(createTraceEvent());

    expect(result).toBeNull();
  });

  it("wraps sinks that only support emit", async () => {
    const seen: string[] = [];

    const sink = createEventStreamFromTraceSink({
      emit(event) {
        seen.push(event.name);
        if (event.name === "trace.fail") {
          return false;
        }
        if (event.name === "trace.unknown") {
          return null;
        }
        return true;
      },
    });

    const result = await sink.emitMany?.([
      createTraceEvent("trace.ok"),
      createTraceEvent("trace.fail"),
    ]);

    expect(result).toBe(false);
    expect(seen).toEqual(["trace.ok", "trace.fail"]);
  });

  it("returns null when wrapped emits are unknown", async () => {
    const sink = createEventStreamFromTraceSink({
      emit(event) {
        if (event.name === "trace.unknown") {
          return null;
        }
        return true;
      },
    });

    const result = await sink.emitMany?.([
      createTraceEvent("trace.ok"),
      createTraceEvent("trace.unknown"),
    ]);

    expect(result).toBeNull();
  });

  it("prefers emitMany when available", async () => {
    const received: EventStreamEvent[][] = [];
    const sink = createEventStreamFromTraceSink({
      emit() {
        return true;
      },
      emitMany(events) {
        received.push(events);
        return true;
      },
    });

    const result = await sink.emitMany?.([createTraceEvent("trace.bulk")]);

    expect(result).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]?.[0]?.name).toBe("trace.bulk");
  });

  it("maps interaction events through an emitter stream", async () => {
    const emitted: string[] = [];

    const stream = createInteractionEventEmitterStream({
      emitter: {
        emit(event) {
          emitted.push(event as string);
          return true;
        },
      },
      mapper: {
        mapEvent(event) {
          return [event.kind];
        },
      },
    });

    const interactionEvent: InteractionEvent = {
      kind: "diagnostic",
      entry: { level: "warn", kind: "adapter", message: "demo" },
      meta: { sequence: 1, timestamp: 0, sourceId: "test" },
    };

    const result = await stream.emit(toInteractionEvent(interactionEvent));

    expect(result).toBe(true);
    expect(emitted).toEqual(["diagnostic"]);
  });
});
