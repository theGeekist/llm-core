import { describe, expect, it } from "bun:test";
import { createHelper, createPipelineRollback } from "@wpkernel/pipeline";
import type { PipelineReporter, PipelineStep } from "@wpkernel/pipeline/core";
import { createPipeline } from "#workflow/pipeline";
import { getContract } from "./helpers";
import type { PipelineContext } from "#workflow/types";

type RunResult = {
  state?: { helperRollbacks?: Map<string, unknown> };
  steps?: readonly PipelineStep[];
};

describe("Workflow pipeline rollback capture", () => {
  it("captures helper rollbacks in the pipeline state", async () => {
    const contract = getContract("agent");
    const pipeline = createPipeline(contract, [{ key: "test.helpers", helperKinds: ["test"] }]);
    const rollback = createPipelineRollback(() => undefined);
    const helper = createHelper<PipelineContext, unknown, unknown, PipelineReporter, "test">({
      key: "test.helper",
      kind: "test",
      apply: () => ({
        output: { ok: true },
        rollback,
      }),
    });

    pipeline.use(helper);

    const result = (await pipeline.run({ input: { ok: true } })) as RunResult;
    const entries = result.state?.helperRollbacks?.get("test") as unknown[] | undefined;
    expect(entries?.length).toBe(1);
  });
});
