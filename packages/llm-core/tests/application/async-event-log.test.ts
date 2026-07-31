import { describe, expect, test } from "bun:test";
import { AsyncEventLog } from "../../src/application/async-event-log";

describe("AsyncEventLog", () => {
  test("replays events, wakes waiting streams, ignores late appends, and propagates failures", async () => {
    const log = new AsyncEventLog<string>();
    const first = log.stream()[Symbol.asyncIterator]();
    const waiting = first.next();

    log.append("first");
    expect(await waiting).toEqual({ value: "first", done: false });

    const replay = log.stream()[Symbol.asyncIterator]();
    expect(await replay.next()).toEqual({ value: "first", done: false });

    log.append("");
    expect(await first.next()).toEqual({ value: "", done: false });
    expect(await replay.next()).toEqual({ value: "", done: false });

    const failure = new Error("stream failed");
    log.close(failure);
    log.append("late");

    await expect(first.next()).rejects.toBe(failure);
    await expect(replay.next()).rejects.toBe(failure);
  });

  test("ends cleanly after close and distinguishes an undefined failure from no failure", async () => {
    const complete = new AsyncEventLog<string>();
    const waiting = complete.stream()[Symbol.asyncIterator]();
    const next = waiting.next();

    complete.close();
    expect(await next).toEqual({ value: undefined, done: true });
    complete.append("late");
    expect(await waiting.next()).toEqual({ value: undefined, done: true });

    const failed = new AsyncEventLog<string>();
    const failedStream = failed.stream()[Symbol.asyncIterator]();
    failed.close(undefined);

    await expect(failedStream.next()).rejects.toBeUndefined();
  });
});
