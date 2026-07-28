import { describe, expect, it } from "bun:test";
import type { AdapterCallContext, RetryMetadata, RetryPolicy } from "../../src/adapters/types";
import {
  jitterDelay,
  isRetryPauseSignal,
  mergeRetryConfig,
  readRetryPausePayload,
  wrapRetryCall,
} from "../../src/workflow/runtime/retry";
import type { RetryWrapperInput } from "../../src/workflow/runtime/retry";

const wrapRetryCallOne = <TInput, TResult>(
  input: RetryWrapperInput<[TInput], TResult>,
  value: TInput,
  context?: AdapterCallContext,
) => wrapRetryCall(input, 1, value, context);

describe("Workflow runtime retry helpers", () => {
  it("merges retry configs by adapter kind", () => {
    const merged = mergeRetryConfig(
      { model: { maxAttempts: 2, backoffMs: 10 } },
      { model: { maxAttempts: 4, backoffMs: 0 } },
    );

    expect(merged?.model?.maxAttempts).toBe(4);
    expect(merged?.model?.backoffMs).toBe(0);
  });

  it("merges disjoint retry kinds without a parallel key catalogue", () => {
    const model = { maxAttempts: 2, backoffMs: 10 };
    const tools = { maxAttempts: 3, backoffMs: 5 };

    const merged = mergeRetryConfig({ model }, { tools });

    expect(merged).toEqual({ model, tools });
  });

  it("preserves defaults for null and partial policy overrides", () => {
    const merged = mergeRetryConfig(
      { model: { maxAttempts: 2, backoffMs: 10, timeoutMs: 50 } },
      { model: { maxAttempts: 4, backoffMs: 0 }, tools: null },
    );

    expect(merged?.model).toEqual({
      maxAttempts: 4,
      backoffMs: 0,
      timeoutMs: 50,
    });
    expect(merged?.tools).toBeNull();
  });

  it("intersects runtime retry reasons with adapter-supported reasons", () => {
    let attempts = 0;
    const policy: RetryPolicy = {
      maxAttempts: 3,
      backoffMs: 0,
      retryOn: ["network", "rate_limit"],
    };
    const metadata: RetryMetadata = { retryOn: ["rate_limit"] };
    const call = () => {
      attempts += 1;
      throw Object.assign(new Error("network unavailable"), { code: "ENETUNREACH" });
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
    expect(attempts).toBe(1);
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

  it("classifies retry reasons from provider errors", () => {
    let attempts = 0;
    const call = () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error("Too many requests"), { status: 429 });
      }
      return "ok";
    };

    const result = wrapRetryCallOne(
      {
        adapterKind: "model",
        method: "generate",
        call,
        policy: {
          maxAttempts: 2,
          backoffMs: 0,
          retryOn: ["rate_limit"],
        },
        trace: [],
        context: {},
      },
      { prompt: "hi" },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("does not retry when runtime and adapter reason policies do not overlap", () => {
    let attempts = 0;
    const call = () => {
      attempts += 1;
      throw Object.assign(new Error("Too many requests"), { status: 429 });
    };

    expect(() =>
      wrapRetryCallOne(
        {
          adapterKind: "model",
          method: "generate",
          call,
          metadata: {
            retryOn: ["network"],
            policy: {
              maxAttempts: 3,
              backoffMs: 0,
              retryOn: ["rate_limit"],
            },
          },
          trace: [],
          context: {},
        },
        { prompt: "hi" },
      ),
    ).toThrow();

    expect(attempts).toBe(1);
  });

  it("uses adapter retry reasons when its fallback policy omits them", () => {
    let attempts = 0;
    const call = () => {
      attempts += 1;
      throw Object.assign(new Error("Too many requests"), { status: 429 });
    };

    expect(() =>
      wrapRetryCallOne(
        {
          adapterKind: "model",
          method: "generate",
          call,
          metadata: {
            retryOn: ["network"],
            policy: {
              maxAttempts: 3,
              backoffMs: 0,
            },
          },
          trace: [],
          context: {},
        },
        { prompt: "hi" },
      ),
    ).toThrow();

    expect(attempts).toBe(1);
  });

  it("enforces async attempt timeouts and reports timeout as the reason", async () => {
    const trace: Array<{ kind: string; at: string; data?: unknown }> = [];
    const call = () => new Promise<string>(() => undefined);

    try {
      await wrapRetryCallOne(
        {
          adapterKind: "model",
          method: "generate",
          call,
          policy: {
            maxAttempts: 1,
            backoffMs: 0,
            timeoutMs: 5,
            retryOn: ["timeout"],
          },
          trace,
          context: {},
        },
        { prompt: "hi" },
      );
      throw new Error("Expected adapter call to time out.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("timed out");
    }

    expect(trace.at(-1)?.kind).toBe("adapter.retry.exhausted");
    expect((trace.at(-1)?.data as { reason?: unknown }).reason).toBe("timeout");
  });

  it("waits before retrying in internal mode", async () => {
    let attempts = 0;
    const startedAt = Date.now();
    const call = () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("flaky");
      }
      return "ok";
    };

    const result = await wrapRetryCallOne(
      {
        adapterKind: "model",
        method: "generate",
        call,
        policy: { maxAttempts: 2, backoffMs: 10, mode: "internal" },
        trace: [],
        context: {},
      },
      { prompt: "hi" },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(8);
  });

  it("rejects when a delayed internal retry fails synchronously", async () => {
    let attempts = 0;
    const call = () => {
      attempts += 1;
      throw new Error("still flaky");
    };

    try {
      await wrapRetryCallOne(
        {
          adapterKind: "model",
          method: "generate",
          call,
          policy: { maxAttempts: 2, backoffMs: 1, mode: "internal" },
          trace: [],
          context: {},
        },
        { prompt: "hi" },
      );
      throw new Error("Expected retries to be exhausted.");
    } catch (error) {
      expect((error as Error).message).toBe("still flaky");
    }

    expect(attempts).toBe(2);
  });

  it("uses the full random backoff range for full jitter", () => {
    expect(jitterDelay(100, "full", () => 0)).toBe(0);
    expect(jitterDelay(100, "full", () => 0.99)).toBe(99);
  });
});
