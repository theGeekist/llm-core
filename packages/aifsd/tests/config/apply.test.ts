import { describe, expect, test } from "bun:test";
import { digest } from "@geekist/llm-core/contracts";

import {
  applyPlan,
  planChanges,
  type ChangeApplicationStatus,
  type ConfigurationResult,
  type ChangePlan,
  type ApplyResult,
  type ArtifactWriter,
  type MaybePromise,
  type PlannedChange,
} from "../../src/config/index.js";
import { createLockFixture } from "./fixtures/configuration.js";

const nativeContent = ['export const runtime = "native";', "console.log(runtime);", ""].join("\n");

const oldDigest = digest("4".repeat(64));
const driftedDigest = digest("5".repeat(64));

const unwrap = <T>(result: ConfigurationResult<T>): T => {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected success, received ${JSON.stringify(result.diagnostics)}`);
  }
  return result.value;
};

const synchronous = <T>(value: MaybePromise<T>): T => {
  if (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value
  ) {
    throw new Error("Expected synchronous MaybePromise branch");
  }
  return value as T;
};

const thenable = <T>(value: T): PromiseLike<T> => ({
  then: <TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> =>
    Promise.resolve(onfulfilled ? onfulfilled(value) : (value as unknown as TResult1)),
});

const createPlan = () =>
  planChanges({
    lock: createLockFixture(),
    desired: [
      {
        path: "generated/native.mjs",
        ownership: "aifsd-owned",
        content: nativeContent,
      },
    ],
    workspace: { artifacts: [] },
  });

const resultPaths = (result: ApplyResult) => ({
  applied: result.applied.map(({ path }) => path),
  skipped: result.skipped.map(({ path }) => path),
  conflicts: result.conflicts.map(({ path }) => path),
});

describe("configuration materialization", () => {
  test("carries explicit native content from the desired artifact into the applied change", () => {
    const plan = createPlan();
    const applied: PlannedChange[] = [];
    const writer: ArtifactWriter = {
      observe: () => null,
      apply: (change) => {
        applied.push(change);
        return "applied";
      },
    };

    const result = unwrap(
      synchronous(
        applyPlan(plan, {
          approvedPlanDigest: plan.planDigest,
          lock: createLockFixture(),
          writer,
        }),
      ),
    );

    expect(plan.changes[0]!.content).toBe(nativeContent);
    expect(plan.changes[0]!.contentDigest).toBeDefined();
    expect(plan.changes[0]!.expectedCurrentDigest).toBeNull();
    expect(applied[0]!.content).toBe(nativeContent);
    expect(resultPaths(result)).toEqual({
      applied: ["generated/native.mjs"],
      skipped: [],
      conflicts: [],
    });
  });

  test("preserves user-owned content without calling the workspace apply port", () => {
    const userContent = "export const userChoice = true;\n";
    const workspace = new Map([["src/user.mjs", userContent]]);
    const plan = planChanges({
      lock: createLockFixture(),
      desired: [
        {
          path: "src/user.mjs",
          ownership: "user-owned",
          content: nativeContent,
        },
      ],
      workspace: {
        artifacts: [{ path: "src/user.mjs", ownership: "user-owned", contentDigest: oldDigest }],
      },
    });
    let applyCalls = 0;
    const writer: ArtifactWriter = {
      observe: () => oldDigest,
      apply: () => {
        applyCalls += 1;
        workspace.set("src/user.mjs", nativeContent);
        return "applied";
      },
    };

    const result = unwrap(
      synchronous(
        applyPlan(plan, {
          approvedPlanDigest: plan.planDigest,
          lock: createLockFixture(),
          writer,
        }),
      ),
    );

    expect(plan.changes[0]!.change).toBe("conflict");
    expect(applyCalls).toBe(0);
    expect(workspace.get("src/user.mjs")).toBe(userContent);
    expect(result.conflicts.map(({ path }) => path)).toEqual(["src/user.mjs"]);
  });

  test("completes every write preflight before making the first apply call", () => {
    const events: string[] = [];
    const lock = createLockFixture();
    const plan = planChanges({
      lock,
      desired: [
        {
          path: "created.mjs",
          ownership: "aifsd-owned",
          content: nativeContent,
        },
        {
          path: "updated.mjs",
          ownership: "aifsd-owned",
          content: nativeContent,
        },
      ],
      workspace: {
        artifacts: [{ path: "updated.mjs", ownership: "aifsd-owned", contentDigest: oldDigest }],
      },
    });
    const writer: ArtifactWriter = {
      observe: (path) => {
        events.push(`observe:${path}`);
        return path === "created.mjs" ? null : oldDigest;
      },
      apply: (change) => {
        events.push(`apply:${change.path}`);
        return "applied";
      },
    };

    const result = unwrap(
      synchronous(
        applyPlan(plan, {
          approvedPlanDigest: plan.planDigest,
          lock,
          writer,
        }),
      ),
    );

    expect(events).toEqual([
      "observe:created.mjs",
      "observe:updated.mjs",
      "apply:created.mjs",
      "apply:updated.mjs",
    ]);
    expect(result.applied).toHaveLength(2);
  });

  test("aborts all writes when any preview digest is stale", () => {
    const writes = new Map<string, string>();
    const applyCalls: string[] = [];
    const lock = createLockFixture();
    const plan = planChanges({
      lock,
      desired: [
        {
          path: "would-have-been-created.mjs",
          ownership: "aifsd-owned",
          content: nativeContent,
        },
        {
          path: "drifted.mjs",
          ownership: "aifsd-owned",
          content: nativeContent,
        },
      ],
      workspace: {
        artifacts: [{ path: "drifted.mjs", ownership: "aifsd-owned", contentDigest: oldDigest }],
      },
    });
    const writer: ArtifactWriter = {
      observe: (path) => (path === "drifted.mjs" ? driftedDigest : null),
      apply: (change) => {
        applyCalls.push(change.path);
        writes.set(change.path, change.content ?? "");
        return "applied";
      },
    };

    const result = synchronous(
      applyPlan(plan, {
        approvedPlanDigest: plan.planDigest,
        lock,
        writer,
      }),
    );

    expect(applyCalls).toEqual([]);
    expect(writes.size).toBe(0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === "stale-plan")).toBe(true);
    }
  });

  test("rejects a plan whose approved lock has drifted", () => {
    const lock = createLockFixture();
    const plan = createPlan();
    const driftedLock = {
      ...lock,
      generator: { ...lock.generator, artifactDigest: driftedDigest },
    };
    let applyCalls = 0;
    const writer: ArtifactWriter = {
      observe: () => null,
      apply: () => {
        applyCalls += 1;
        return "applied";
      },
    };

    const result = synchronous(
      applyPlan(plan, {
        approvedPlanDigest: plan.planDigest,
        lock: driftedLock,
        writer,
      }),
    );

    expect(result.ok).toBe(false);
    expect(applyCalls).toBe(0);
    if (!result.ok) {
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === "stale-plan")).toBe(true);
    }
  });

  test("rejects a write without an explicit preview digest precondition", () => {
    const lock = createLockFixture();
    const validPlan = createPlan();
    const change = { ...validPlan.changes[0]! } as Partial<PlannedChange>;
    Reflect.deleteProperty(change, "expectedCurrentDigest");
    const plan = { ...validPlan, changes: [change] } as unknown as ChangePlan;
    let applyCalls = 0;
    const writer: ArtifactWriter = {
      observe: () => null,
      apply: () => {
        applyCalls += 1;
        return "applied";
      },
    };

    const result = synchronous(
      applyPlan(plan, {
        approvedPlanDigest: validPlan.planDigest,
        lock,
        writer,
      }),
    );

    expect(result.ok).toBe(false);
    expect(applyCalls).toBe(0);
    if (!result.ok) {
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === "stale-plan")).toBe(true);
    }
  });

  test("keeps a fully synchronous workspace synchronous", () => {
    const writer: ArtifactWriter = {
      observe: () => null,
      apply: (): ChangeApplicationStatus => "applied",
    };

    const plan = createPlan();
    const result = applyPlan(plan, {
      approvedPlanDigest: plan.planDigest,
      lock: createLockFixture(),
      writer,
    });

    expect(result).not.toBeInstanceOf(Promise);
    expect(resultPaths(unwrap(synchronous(result)))).toEqual({
      applied: ["generated/native.mjs"],
      skipped: [],
      conflicts: [],
    });
  });

  test("applies visible rename and delete actions through the workspace port", () => {
    const lock = createLockFixture();
    const plan = planChanges({
      lock,
      desired: [
        {
          path: "renamed.mjs",
          previousPath: "old-name.mjs",
          ownership: "aifsd-owned",
          content: nativeContent,
        },
      ],
      workspace: {
        artifacts: [
          { path: "old-name.mjs", ownership: "aifsd-owned", contentDigest: oldDigest },
          { path: "removed.mjs", ownership: "aifsd-owned", contentDigest: oldDigest },
        ],
      },
    });
    const applied: PlannedChange[] = [];
    const writer: ArtifactWriter = {
      observe: (path) => {
        if (path === "renamed.mjs") {
          return null;
        }
        if (path === "old-name.mjs" || path === "removed.mjs") {
          return oldDigest;
        }
        throw new Error(`unexpected observation path: ${path}`);
      },
      apply: (change) => {
        applied.push(change);
        return "applied";
      },
    };

    const result = unwrap(
      synchronous(
        applyPlan(plan, {
          approvedPlanDigest: plan.planDigest,
          lock,
          writer,
        }),
      ),
    );

    expect(applied.map(({ change }) => change).sort()).toEqual(["delete", "rename"]);
    expect(result.applied.map(({ path }) => path).sort()).toEqual(["old-name.mjs", "removed.mjs"]);
  });

  test("keeps an AIFSD-owned rename source valid when the desired destination is labelled shared", () => {
    const lock = createLockFixture();
    const plan = planChanges({
      lock,
      desired: [
        {
          path: "shared-destination.mjs",
          previousPath: "generated/source.mjs",
          ownership: "shared",
          content: nativeContent,
        },
      ],
      workspace: {
        artifacts: [
          {
            path: "generated/source.mjs",
            ownership: "aifsd-owned",
            contentDigest: oldDigest,
          },
        ],
      },
    });
    const applied: PlannedChange[] = [];
    const writer: ArtifactWriter = {
      observe: (path) => (path === "generated/source.mjs" ? oldDigest : null),
      apply: (change) => {
        applied.push(change);
        return "applied";
      },
    };

    const result = unwrap(
      synchronous(
        applyPlan(plan, {
          approvedPlanDigest: plan.planDigest,
          lock,
          writer,
        }),
      ),
    );

    expect(plan.changes[0]).toEqual(
      expect.objectContaining({
        path: "generated/source.mjs",
        renameTo: "shared-destination.mjs",
        ownership: "aifsd-owned",
        change: "rename",
      }),
    );
    expect(applied).toHaveLength(1);
    expect(result.applied).toHaveLength(1);
  });

  test("adopts non-native thenables from observe and apply without changing semantics", async () => {
    const events: string[] = [];
    const writer: ArtifactWriter = {
      observe: (path) => {
        events.push(`observe:${path}`);
        return thenable(null);
      },
      apply: (change) => {
        events.push(`apply:${change.path}`);
        return thenable<ChangeApplicationStatus>("applied");
      },
    };

    const plan = createPlan();
    const pending = applyPlan(plan, {
      approvedPlanDigest: plan.planDigest,
      lock: createLockFixture(),
      writer,
    });

    expect(typeof (pending as PromiseLike<unknown>).then).toBe("function");
    expect(resultPaths(unwrap(await pending))).toEqual({
      applied: ["generated/native.mjs"],
      skipped: [],
      conflicts: [],
    });
    expect(events).toEqual(["observe:generated/native.mjs", "apply:generated/native.mjs"]);
  });

  test("returns a frozen result without retaining mutable plan ownership", () => {
    const plan = structuredClone(createPlan()) as ChangePlan;
    const writer: ArtifactWriter = {
      observe: () => null,
      apply: () => "applied",
    };
    const result = unwrap(
      synchronous(
        applyPlan(plan, {
          approvedPlanDigest: plan.planDigest,
          lock: createLockFixture(),
          writer,
        }),
      ),
    );
    const mutablePlan = plan as unknown as {
      changes: Array<{ path: string; reasonCode: string }>;
    };

    mutablePlan.changes[0]!.path = "mutated-after-apply.mjs";
    mutablePlan.changes[0]!.reasonCode = "mutated";

    expect(result.applied[0]!.path).toBe("generated/native.mjs");
    expect(result.applied[0]!.reasonCode).not.toBe("mutated");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.applied[0]!)).toBe(true);
  });
});
