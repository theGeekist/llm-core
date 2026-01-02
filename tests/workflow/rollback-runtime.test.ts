import { describe, expect, it } from "bun:test";
import { createPipelineRollback } from "@wpkernel/pipeline/core";
import { runPauseRollback } from "#workflow/runtime/rollback";
import type { PipelinePauseSnapshot } from "@wpkernel/pipeline/core";

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

const buildPauseSnapshot = (input: {
  steps?: Array<{ key: string; index: number }>;
  entries?: Array<{ helper: { key: string }; rollback: unknown }>;
  reporter?: { warn?: (message: string, context?: unknown) => void };
  userState?: unknown;
}): PipelinePauseSnapshot<unknown> => ({
  stageIndex: 0,
  state: {
    steps: input.steps,
    context: input.reporter ? { reporter: input.reporter } : undefined,
    userState:
      input.userState ??
      (input.entries
        ? {
            helperRollbacks: new Map([["recipe.steps", input.entries]]),
          }
        : undefined),
  },
  token: "token-snapshot",
  pauseKind: "human",
  createdAt: Date.now(),
});

type RollbackResultInput = {
  steps: Array<{ key: string; index: number }>;
  entries: Array<{ helper: { key: string }; rollback: unknown }>;
  reporter?: { warn?: (message: string, context?: unknown) => void };
  interrupt?: { mode: "continue" | "restart" };
};

const buildRollbackResult = (input: RollbackResultInput): RollbackResult =>
  ({
    steps: input.steps,
    state: {
      helperRollbacks: new Map([["recipe.steps", input.entries]]),
    },
    context: input.reporter ? { reporter: input.reporter } : undefined,
    __interrupt: input.interrupt,
  }) as RollbackResult;

describe("Workflow pause rollbacks", () => {
  it("runs rollbacks from paused pipeline snapshots", async () => {
    let ran = false;
    const entries = [
      createRollbackEntry("step.snapshot", () => {
        ran = true;
      }),
    ];
    const snapshot = buildPauseSnapshot({
      steps: [{ key: "step.snapshot", index: 0 }],
      entries,
      reporter: {},
    });
    const result = {
      __paused: true,
      snapshot,
      __interrupt: { mode: "restart" },
    };

    await runPauseRollback(result);
    expect(ran).toBe(true);
  });

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
    const result = buildRollbackResult({
      steps: [
        { key: "step.missing", index: 0 },
        { key: "step.alpha", index: 1 },
      ],
      entries,
      interrupt: { mode: "restart" },
    });

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
    const result = buildRollbackResult({
      steps: [{ key: "step.alpha", index: 0 }],
      entries,
    });

    await runPauseRollback(result);
    expect(ran).toBe(false);
  });

  it("returns null when rollback state is missing", async () => {
    const result = {
      __interrupt: { mode: "restart" },
    };

    const value = await runPauseRollback(result);
    expect(value).toBeNull();
  });

  it("runs rollbacks without reporter or pause snapshot", async () => {
    let ran = false;
    const entries = [
      createRollbackEntry("step.orphan", () => {
        ran = true;
      }),
    ];
    const result = buildRollbackResult({
      steps: [{ key: "step.orphan", index: 0 }],
      entries,
      interrupt: { mode: "restart" },
    });

    await runPauseRollback(result);
    expect(ran).toBe(true);
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
    const result = buildRollbackResult({
      steps: [{ key: "step.alpha", index: 0 }],
      entries,
      reporter,
      interrupt: { mode: "restart" },
    });

    await runPauseRollback(result);
    expect(warned).toBe(true);
  });

  it("returns null when paused snapshot lacks rollback state", async () => {
    const snapshot = buildPauseSnapshot({
      steps: [{ key: "step.snapshot", index: 0 }],
      userState: "not-state",
    });
    const result = {
      __paused: true,
      snapshot,
      __interrupt: { mode: "restart" },
    };

    const value = await runPauseRollback(result);
    expect(value).toBeNull();
  });

  it("uses paused steps fallback when no steps are present", async () => {
    let ran = false;
    const entries = [
      createRollbackEntry("step.orphan", () => {
        ran = true;
      }),
    ];
    const snapshot = buildPauseSnapshot({
      entries,
    });
    const result = {
      __paused: true,
      snapshot,
      __interrupt: { mode: "restart" },
    };

    await runPauseRollback(result);
    expect(ran).toBe(true);
  });

  it("returns null when helper rollbacks are missing", async () => {
    const result = {
      state: {},
      __interrupt: { mode: "restart" },
    };

    const value = await runPauseRollback(result);
    expect(value).toBeNull();
  });

  it("warns using paused reporter context", async () => {
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
    const snapshot = buildPauseSnapshot({
      steps: [{ key: "step.alpha", index: 0 }],
      entries,
      reporter,
    });
    const result = {
      __paused: true,
      snapshot,
      __interrupt: { mode: "restart" },
    };

    await runPauseRollback(result);
    expect(warned).toBe(true);
  });
});
