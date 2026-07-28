import { describe, expect, it } from "bun:test";
import {
  createEventStreamFanout,
  createEventStreamFromTraceSink,
  createInteractionEventDeliverySink,
  createInteractionEventDeliveryStream,
  createInteractionEventEmitterStream,
} from "#adapters";
import type { EventStreamEvent } from "#adapters";
import type { InteractionEvent } from "#interaction";

const toInteractionEvent = (event: InteractionEvent): EventStreamEvent => ({
  name: "interaction.test",
  data: { event },
});

const toUncheckedInteractionEvent = (event: unknown): EventStreamEvent => ({
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

  it("reports fanout success when another sink is not applicable", async () => {
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

    expect(result).toBe(true);
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

  it("returns true when at least one wrapped emit succeeds and none fail", async () => {
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

    expect(result).toBe(true);
  });

  it("waits for a deferred wrapped emit before starting the next", async () => {
    let resolveFirst: (value: boolean) => void = (_value: boolean) => undefined;
    const seen: string[] = [];
    const first = new Promise<boolean>((resolve) => {
      resolveFirst = resolve;
    });
    const sink = createEventStreamFromTraceSink({
      emit(event) {
        seen.push(event.name);
        return event.name === "trace.first" ? first : true;
      },
    });

    const result = sink.emitMany?.([
      createTraceEvent("trace.first"),
      createTraceEvent("trace.second"),
    ]);

    expect(seen).toEqual(["trace.first"]);
    resolveFirst(true);
    expect(await result).toBe(true);
    expect(seen).toEqual(["trace.first", "trace.second"]);
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
        emit(event: string) {
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

  it("emits mapped events sequentially and keeps an applicable success", async () => {
    let resolveFirst: (value: boolean) => void = (_value: boolean) => undefined;
    const emitted: string[] = [];
    const first = new Promise<boolean>((resolve) => {
      resolveFirst = resolve;
    });
    const stream = createInteractionEventEmitterStream({
      emitter: {
        emit(event: string) {
          emitted.push(event);
          return event === "first" ? first : null;
        },
      },
      mapper: {
        mapEvent() {
          return ["first", "second"];
        },
      },
    });
    const interactionEvent: InteractionEvent = {
      kind: "diagnostic",
      entry: { level: "warn", kind: "adapter", message: "demo" },
      meta: { sequence: 1, timestamp: 0, sourceId: "test" },
    };

    const result = stream.emit(toInteractionEvent(interactionEvent));

    expect(emitted).toEqual(["first"]);
    resolveFirst(true);
    expect(await result).toBe(true);
    expect(emitted).toEqual(["first", "second"]);
  });

  it("rejects malformed interaction payloads before mapper state can change", async () => {
    const mappedKinds: string[] = [];
    const emitted: string[] = [];
    const stream = createInteractionEventEmitterStream({
      emitter: {
        emit(event: string) {
          emitted.push(event);
          return true;
        },
      },
      mapper: {
        mapEvent(event) {
          mappedKinds.push(event.kind);
          return [event.kind];
        },
      },
    });
    const meta = { sequence: 1, timestamp: 0, sourceId: "test" };
    const malformed = [
      { kind: "model", meta },
      { kind: "query", event: { type: "unknown" }, meta },
      { kind: "item", event: { type: "completed", item: null }, meta },
      { kind: "subagent", event: { type: "selected", agent: null }, meta },
      { kind: "diagnostic", entry: { level: "warn" }, meta },
      { kind: "trace", event: { kind: "trace.demo" }, meta },
      { kind: "event-stream", event: { data: {} }, meta },
    ];

    for (const event of malformed) {
      expect(await stream.emit(toUncheckedInteractionEvent(event))).toBeNull();
    }

    expect(mappedKinds).toEqual([]);
    expect(emitted).toEqual([]);
  });

  it("shares ordered batch delivery between interaction sinks and streams", async () => {
    const delivered: string[][] = [];
    const mapper = {
      mapEvent(event: InteractionEvent) {
        return [event.kind, `${event.meta.sourceId}:${event.meta.sequence}`];
      },
    };
    const deliver = (events: string[]) => {
      delivered.push(events);
      return events.length > 0 ? true : null;
    };
    const sink = createInteractionEventDeliverySink({ mapper, deliver });
    const stream = createInteractionEventDeliveryStream({ mapper, deliver });
    const first: InteractionEvent = {
      kind: "diagnostic",
      entry: { level: "warn", kind: "adapter", message: "demo" },
      meta: { sequence: 1, timestamp: 0, sourceId: "first" },
    };
    const second: InteractionEvent = {
      kind: "trace",
      event: { kind: "trace.demo", at: "now" },
      meta: { sequence: 2, timestamp: 0, sourceId: "second" },
    };

    expect(await sink.onEvent(first)).toBe(true);
    expect(
      await stream.emitMany([
        toInteractionEvent(first),
        createTraceEvent(),
        toInteractionEvent(second),
      ]),
    ).toBe(true);
    expect(delivered).toEqual([
      ["diagnostic", "first:1"],
      ["diagnostic", "first:1", "trace", "second:2"],
    ]);
  });
});
