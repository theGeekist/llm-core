import { describe, expect, it } from "bun:test";
import { createPipelineRollback } from "@wpkernel/pipeline/core";
import { runPauseRollback } from "#workflow/runtime/rollback";

type RollbackResult = {
  steps?: Array<{ key: string; index: number }>;
  state?: {
    helperRollbacks?: Map<string, Array<{ helper: { key: string }; rollback: unknown }>>;
  };
  context?: { reporter?: { warn?: (message: string, context?: unknown) => void } };
};

const createRollbackEntry = (key: string, run: () => void) => ({
  helper: { key },
  rollback: createPipelineRollback(run),
});

const buildRollbackResult = (
  steps: Array<{ key: string; index: number }>,
  entries: Array<{ helper: { key: string }; rollback: unknown }>,
  reporter?: { warn?: (message: string, context?: unknown) => void },
  interrupt?: { mode: "continue" | "restart" },
): RollbackResult =>
  ({
    steps,
    state: {
      helperRollbacks: new Map([["recipe.steps", entries]]),
    },
    context: reporter ? { reporter } : undefined,
    __interrupt: interrupt,
  }) as RollbackResult;

describe("Workflow pause rollbacks", () => {
  it("orders rollbacks by steps and keeps orphans last", async () => {
    const order: string[] = [];
    const entries = [
      createRollbackEntry("step.alpha", () => {
        order.push("alpha-1");
      }),
      createRollbackEntry("step.alpha", () => {
        order.push("alpha-2");
      }),
      createRollbackEntry("step.orphan", () => {
        order.push("orphan");
      }),
    ];
    const result = buildRollbackResult(
      [
        { key: "step.missing", index: 0 },
        { key: "step.alpha", index: 1 },
      ],
      entries,
      undefined,
      { mode: "restart" },
    );

    await runPauseRollback(result);
    expect(order).toEqual(["orphan", "alpha-2", "alpha-1"]);
  });

  it("skips rollbacks when interrupt is not restart", async () => {
    let ran = false;
    const entries = [
      createRollbackEntry("step.alpha", () => {
        ran = true;
      }),
    ];
    const result = buildRollbackResult([{ key: "step.alpha", index: 0 }], entries);

    await runPauseRollback(result);
    expect(ran).toBe(false);
  });

  it("warns when rollback execution fails", async () => {
    let warned = false;
    const reporter = {
      warn: (message: string) => {
        warned = message.includes("Helper rollback failed during pause");
      },
    };
    const entries = [
      createRollbackEntry("step.alpha", () => {
        throw new Error("rollback failed");
      }),
    ];
    const result = buildRollbackResult([{ key: "step.alpha", index: 0 }], entries, reporter, {
      mode: "restart",
    });

    await runPauseRollback(result);
    expect(warned).toBe(true);
  });
});
