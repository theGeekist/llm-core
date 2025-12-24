import { describe, expect, it } from "bun:test";
import { driveIterator } from "../../src/workflow/driver/iterator";
import { isExecutionIterator } from "../../src/workflow/driver/sessions";

describe("Workflow driver iterator", () => {
  it("detects iterator shapes by next()", () => {
    expect(isExecutionIterator(null)).toBe(false);
    expect(isExecutionIterator({ next: () => ({ done: true, value: "ok" }) })).toBe(true);
  });

  it("finalizes when the iterator completes", async () => {
    const iterator = {
      next: () => ({ done: true, value: "done" }),
    };
    const result = await driveIterator(
      iterator,
      undefined,
      [],
      () => [],
      "default",
      (value, _getDiagnostics, _trace, _mode, iter) => ({
        value,
        iterator: iter,
      }),
      () => ({ value: "error", iterator: undefined }),
      () => ({ value: "invalid", iterator: undefined }),
    );
    expect(result.value).toBe("done");
    expect(result.iterator).toBeUndefined();
  });

  it("passes the iterator when there is more work", async () => {
    const iterator = {
      next: () => ({ done: false, value: { paused: true, value: "step" } }),
    };
    const result = await driveIterator(
      iterator,
      "input",
      [],
      () => [],
      "default",
      (value, _getDiagnostics, _trace, _mode, iter) => ({
        value: (value as { value: string }).value,
        iterator: iter,
      }),
      () => ({ value: "error", iterator: undefined }),
      () => ({ value: "invalid", iterator: undefined }),
    );
    expect(result.value).toBe("step");
    expect(result.iterator).toBe(iterator);
  });

  it("handles iterator errors via the error handler", async () => {
    const iterator = {
      next: () => {
        throw new Error("boom");
      },
    };
    const result = await driveIterator<{ value: string; error?: string }>(
      iterator,
      undefined,
      [],
      () => [],
      "default",
      (value, getDiagnostics, trace, mode) => {
        void getDiagnostics;
        void trace;
        void mode;
        return { value: String(value) };
      },
      (error) => ({ value: "error", error: (error as Error).message }),
      () => ({ value: "invalid" }),
    );
    expect(result.error).toBe("boom");
  });
});
