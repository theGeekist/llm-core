import { describe, expect, it } from "bun:test";
import { createHelper } from "@wpkernel/pipeline";
import type { PipelinePaused, PipelineReporter } from "@wpkernel/pipeline/core";
import { createPipeline } from "#workflow/pipeline";
import type { PipelineContext, PipelineState } from "#workflow/types";
import { toRetryPauseResult } from "../../src/recipes/retry-pause";
import { readInterruptStrategy } from "../../src/workflow/runtime/pause-metadata";
import { getContract } from "./helpers";

const isPipelinePaused = (value: unknown): value is PipelinePaused<unknown> =>
  !!value &&
  typeof value === "object" &&
  "__paused" in value &&
  (value as { __paused?: unknown }).__paused === true;

describe("Workflow pipeline pause stage", () => {
  it("creates a kernel snapshot, clears the request, and resumes from that snapshot", async () => {
    const contract = getContract("agent");
    const pipeline = createPipeline(contract, [{ key: "test.pause", helperKinds: ["test"] }]);
    pipeline.use(
      createHelper<PipelineContext, unknown, unknown, PipelineReporter, "test">({
        key: "test.pause",
        kind: "test",
        apply: ({ output }) => {
          const state = output as PipelineState;
          state.value = "before-pause";
          state.__pause = {
            token: "pause-token",
            pauseKind: "human",
            payload: { reason: "approval" },
          };
          return { output: state };
        },
      }),
    );

    const paused = await pipeline.run({ input: "start" });
    expect(isPipelinePaused(paused)).toBe(true);
    if (!isPipelinePaused(paused)) {
      throw new Error("Expected the workflow pipeline to pause.");
    }
    expect(paused.snapshot).toMatchObject({
      token: "pause-token",
      pauseKind: "human",
      payload: { reason: "approval" },
    });
    expect((paused.snapshot.state as { userState?: PipelineState }).userState).toEqual({
      value: "before-pause",
    });

    const resumed = (await pipeline.resume(paused.snapshot, {
      decision: "approve",
    })) as { artefact: PipelineState };
    expect(resumed.artefact).toEqual({ value: "before-pause" });
  });

  it("carries retry continuation metadata through the kernel snapshot payload", async () => {
    const contract = getContract("agent");
    const pipeline = createPipeline(contract, [{ key: "test.retry", helperKinds: ["test"] }]);
    pipeline.use(
      createHelper<PipelineContext, unknown, unknown, PipelineReporter, "test">({
        key: "test.retry",
        kind: "test",
        apply: ({ input, output }) =>
          toRetryPauseResult({
            state: output as PipelineState,
            input,
            spec: { name: "generate", kind: "model" },
            payload: {
              adapterKind: "model",
              method: "generate",
              attempt: 1,
              maxAttempts: 3,
              delayMs: 10,
              retryAt: 123,
              reason: "rate_limit",
            },
          }),
      }),
    );

    const paused = await pipeline.run({ input: { prompt: "hello" } });
    expect(isPipelinePaused(paused)).toBe(true);
    if (!isPipelinePaused(paused)) {
      throw new Error("Expected the retrying workflow pipeline to pause.");
    }
    expect(paused.snapshot.payload).toMatchObject({
      kind: "retry",
      adapterKind: "model",
      method: "generate",
      input: { prompt: "hello" },
      step: { name: "generate", kind: "model" },
      interrupt: { mode: "restart", reason: "retry" },
    });
    expect(readInterruptStrategy(paused)).toMatchObject({
      mode: "restart",
      reason: "retry",
    });
  });
});
