import { describe, expect, it } from "bun:test";
import type { AdapterCallContext, RetryMetadata, RetryPolicy } from "../../src/adapters/types";
import {
  isRetryPauseSignal,
  mergeRetryConfig,
  readRetryPausePayload,
  wrapRetryCallOne,
} from "../../src/workflow/runtime/retry";

describe("Workflow runtime retry helpers", () => {
  it("merges retry configs by adapter kind", () => {
    const merged = mergeRetryConfig(
      { model: { maxAttempts: 2, backoffMs: 10 } },
      { model: { maxAttempts: 4, backoffMs: 0 } },
    );

    expect(merged?.model?.maxAttempts).toBe(4);
    expect(merged?.model?.backoffMs).toBe(0);
  });

  it("ignores retry metadata allowed=false when runtime policy is provided", () => {
    let attempts = 0;
    const policy: RetryPolicy = { maxAttempts: 3, backoffMs: 0 };
    const metadata: RetryMetadata = { allowed: false };
    const call = () => {
      attempts += 1;
      throw new Error("nope");
    };

    expect(() =>
      wrapRetryCallOne(
        {
          adapterKind: "embedder",
          method: "embed",
          call,
          policy,
          metadata,
          trace: [],
          context: {} as AdapterCallContext,
        },
        "hello",
      ),
    ).toThrow();
    expect(attempts).toBe(3);
  });

  it("pauses when policy uses backoff and pause mode", () => {
    const policy: RetryPolicy = { maxAttempts: 3, backoffMs: 50, mode: "pause" };
    const call = () => {
      throw new Error("nope");
    };

    try {
      wrapRetryCallOne(
        {
          adapterKind: "model",
          method: "generate",
          call,
          policy,
          trace: [],
          context: {} as AdapterCallContext,
        },
        { prompt: "hi" },
      );
      throw new Error("Expected retry pause.");
    } catch (error) {
      expect(isRetryPauseSignal(error)).toBe(true);
      const payload = readRetryPausePayload(error as { kind: "retry.pause"; payload: never });
      expect(payload.attempt).toBe(1);
      expect(payload.delayMs).toBeGreaterThan(0);
    }
  });

  it("does not retry when retryOn does not include the reason", () => {
    let attempts = 0;
    const policy: RetryPolicy = {
      maxAttempts: 3,
      backoffMs: 0,
      retryOn: ["timeout"],
    };
    const call = () => {
      attempts += 1;
      throw new Error("nope");
    };

    expect(() =>
      wrapRetryCallOne(
        {
          adapterKind: "model",
          method: "generate",
          call,
          policy,
          trace: [],
          context: {} as AdapterCallContext,
        },
        { prompt: "hi" },
      ),
    ).toThrow();
    expect(attempts).toBe(1);
  });
});
