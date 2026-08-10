import { describe, expect, test } from "bun:test";
import { digest } from "@aifsd/llm-core/contracts";

import {
  applyPlan,
  planChanges,
  type ConfigurationResult,
  type ChangePlan,
  type ApplyResult,
  type ArtifactWriter,
  type MaybePromise,
  type ChangePlanInput,
  type PlannedChange,
} from "../../src/config/index.js";
import { createLockFixture, fixtureContentDigest } from "./fixtures/configuration.js";

const sourceDigest = digest("4".repeat(64));
const destinationDigest = digest("5".repeat(64));
const nativeContent = 'export const message = "materialized";\n';

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

const plan = (
  desired: ChangePlanInput["desired"],
  artifacts: ChangePlanInput["workspace"]["artifacts"],
): ChangePlan =>
  planChanges({
    lock: createLockFixture(),
    desired,
    workspace: { artifacts },
  });

const rename = (
  sourcePath = "generated/old.mjs",
  targetPath = "generated/new.mjs",
): ChangePlanInput["desired"][number] => ({
  path: targetPath,
  previousPath: sourcePath,
  ownership: "aifsd-owned",
  content: nativeContent,
});

const workspaceArtifact = (
  path: string,
  ownership: ChangePlanInput["workspace"]["artifacts"][number]["ownership"] = "aifsd-owned",
  contentDigest = sourceDigest,
): ChangePlanInput["workspace"]["artifacts"][number] => ({
  path,
  ownership,
  contentDigest,
});

const assertNoDestructiveRename = (
  attempt: () => ChangePlan,
  forbiddenPaths: readonly string[],
): void => {
  let result: ChangePlan;
  try {
    result = attempt();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    return;
  }

  const forbidden = new Set(forbiddenPaths);
  const destructive = result.changes.filter(
    (change) =>
      (change.change === "rename" ||
        change.change === "delete" ||
        change.change === "create" ||
        change.change === "update-owned-region" ||
        change.change === "merge") &&
      (forbidden.has(change.path) ||
        (change.renameTo !== undefined && forbidden.has(change.renameTo))),
  );

  expect(destructive).toEqual([]);
  expect(result.changes.some((change) => change.change === "conflict")).toBe(true);
};

const assertPlanningRejected = (attempt: () => ChangePlan): void => {
  expect(attempt).toThrow();
};

const expectStalePlan = (
  result: ConfigurationResult<ApplyResult>,
  applyCalls: readonly PlannedChange[],
): void => {
  expect(result.ok).toBe(false);
  expect(applyCalls).toEqual([]);
  if (!result.ok) {
    expect(result.diagnostics.some(({ code }) => code === "stale-plan")).toBe(true);
  }
};

describe("adversarial materialization planning", () => {
  test.each(["shared", "user-owned"] as const)(
    "never renames a %s source by relabelling it AIFSD-owned",
    (ownership) => {
      assertNoDestructiveRename(
        () => plan([rename()], [workspaceArtifact("generated/old.mjs", ownership)]),
        ["generated/old.mjs", "generated/new.mjs"],
      );
    },
  );

  test("does not rename over an occupied destination", () => {
    assertNoDestructiveRename(
      () =>
        plan(
          [rename()],
          [
            workspaceArtifact("generated/old.mjs"),
            workspaceArtifact("generated/new.mjs", "user-owned", destinationDigest),
          ],
        ),
      ["generated/old.mjs", "generated/new.mjs"],
    );
  });

  test.each([
    {
      name: "duplicate desired targets",
      desired: [
        { path: "generated/same.mjs", ownership: "aifsd-owned" as const, content: "one\n" },
        { path: "generated/same.mjs", ownership: "aifsd-owned" as const, content: "two\n" },
      ],
      artifacts: [],
    },
    {
      name: "duplicate rename sources",
      desired: [
        rename("generated/source.mjs", "generated/one.mjs"),
        rename("generated/source.mjs", "generated/two.mjs"),
      ],
      artifacts: [workspaceArtifact("generated/source.mjs")],
    },
    {
      name: "a rename target colliding with another desired path",
      desired: [
        rename("generated/source.mjs", "generated/target.mjs"),
        {
          path: "generated/target.mjs",
          ownership: "aifsd-owned" as const,
          content: "independent\n",
        },
      ],
      artifacts: [workspaceArtifact("generated/source.mjs")],
    },
    {
      name: "a rename source colliding with another desired target",
      desired: [
        rename("generated/source.mjs", "generated/target.mjs"),
        {
          path: "generated/source.mjs",
          ownership: "aifsd-owned" as const,
          content: "replacement\n",
        },
      ],
      artifacts: [workspaceArtifact("generated/source.mjs")],
    },
    {
      name: "cyclic rename sources and targets",
      desired: [
        rename("generated/a.mjs", "generated/b.mjs"),
        rename("generated/b.mjs", "generated/a.mjs"),
      ],
      artifacts: [workspaceArtifact("generated/a.mjs"), workspaceArtifact("generated/b.mjs")],
    },
  ])("rejects $name", ({ desired, artifacts }) => {
    assertPlanningRejected(() => plan(desired, artifacts));
  });

  test.each([
    "/tmp/generated.mjs",
    "../generated.mjs",
    "generated/../../outside.mjs",
    "./generated.mjs",
    "generated/./file.mjs",
    "generated//file.mjs",
    "generated\\file.mjs",
    "C:\\workspace\\generated.mjs",
  ])("rejects non-canonical desired path %s", (path) => {
    assertPlanningRejected(() =>
      plan([{ path, ownership: "aifsd-owned", content: nativeContent }], []),
    );
  });

  test.each([
    "/tmp/generated.mjs",
    "../generated.mjs",
    "generated/../../outside.mjs",
    "./generated.mjs",
    "generated/./file.mjs",
    "generated//file.mjs",
    "generated\\file.mjs",
    "C:\\workspace\\generated.mjs",
  ])("rejects non-canonical rename source path %s", (previousPath) => {
    assertPlanningRejected(() =>
      plan([rename(previousPath, "generated/new.mjs")], [workspaceArtifact(previousPath)]),
    );
  });

  test.each([
    "/tmp/generated.mjs",
    "../generated.mjs",
    "generated/../../outside.mjs",
    "./generated.mjs",
    "generated/./file.mjs",
    "generated//file.mjs",
    "generated\\file.mjs",
    "C:\\workspace\\generated.mjs",
  ])("rejects non-canonical workspace path %s", (path) => {
    assertPlanningRejected(() => plan([], [workspaceArtifact(path)]));
  });

  test("rejects exact duplicate workspace paths", () => {
    assertPlanningRejected(() =>
      plan(
        [],
        [
          workspaceArtifact("generated/file.mjs", "aifsd-owned"),
          workspaceArtifact("generated/file.mjs", "user-owned", destinationDigest),
        ],
      ),
    );
  });

  test.each([
    ["generated/file.mjs", "./generated/file.mjs"],
    ["generated/file.mjs", "generated/./file.mjs"],
    ["generated/file.mjs", "generated/nested/../file.mjs"],
    ["generated/file.mjs", "generated//file.mjs"],
    ["generated/file.mjs", "generated\\file.mjs"],
  ])("rejects aliased workspace paths %s and %s", (canonical, alias) => {
    assertPlanningRejected(() =>
      plan([], [workspaceArtifact(canonical), workspaceArtifact(alias, "user-owned")]),
    );
  });
});

describe("adversarial rename materialization", () => {
  test("observes both rename endpoints and aborts when the destination appears after planning", () => {
    const lock = createLockFixture();
    const approvedPlan = planChanges({
      lock,
      desired: [rename()],
      workspace: { artifacts: [workspaceArtifact("generated/old.mjs")] },
    });
    const observed: string[] = [];
    const applyCalls: PlannedChange[] = [];
    const writer: ArtifactWriter = {
      observe: (path) => {
        observed.push(path);
        return path === "generated/old.mjs" ? sourceDigest : destinationDigest;
      },
      apply: (change) => {
        applyCalls.push(change);
        return "applied";
      },
    };

    const result = synchronous(
      applyPlan(approvedPlan, {
        approvedPlanDigest: approvedPlan.planDigest,
        lock,
        writer,
      }),
    );

    expect([...observed].sort()).toEqual(["generated/old.mjs", "generated/new.mjs"].sort());
    expectStalePlan(result, applyCalls);
  });

  test("treats an equal-digest destination appearing after planning as stale", () => {
    const lock = createLockFixture();
    const approvedPlan = planChanges({
      lock,
      desired: [rename()],
      workspace: { artifacts: [workspaceArtifact("generated/old.mjs")] },
    });
    const observed: string[] = [];
    const applyCalls: PlannedChange[] = [];
    const writer: ArtifactWriter = {
      observe: (path) => {
        observed.push(path);
        return sourceDigest;
      },
      apply: (change) => {
        applyCalls.push(change);
        return "applied";
      },
    };

    const result = synchronous(
      applyPlan(approvedPlan, {
        approvedPlanDigest: approvedPlan.planDigest,
        lock,
        writer,
      }),
    );

    expect([...observed].sort()).toEqual(["generated/old.mjs", "generated/new.mjs"].sort());
    expectStalePlan(result, applyCalls);
  });
});

describe("closed materialization plan boundary", () => {
  const validCreatePlan = () => {
    const lock = createLockFixture();
    const approvedPlan = planChanges({
      lock,
      desired: [
        {
          path: "generated/new.mjs",
          ownership: "aifsd-owned",
          content: nativeContent,
        },
      ],
      workspace: { artifacts: [] },
    });
    return { lock, approvedPlan };
  };

  const expectRejectedBeforeEffects = (
    malformedPlan: ChangePlan,
    lock: ReturnType<typeof createLockFixture>,
    approvedPlanDigest = malformedPlan.planDigest,
  ) => {
    const observed: string[] = [];
    const applied: PlannedChange[] = [];
    let result: ConfigurationResult<ApplyResult> | undefined;
    expect(() => {
      result = synchronous(
        applyPlan(malformedPlan, {
          approvedPlanDigest,
          lock,
          writer: {
            observe: (path) => {
              observed.push(path);
              return null;
            },
            apply: (change) => {
              applied.push(change);
              return "applied";
            },
          },
        }),
      );
    }).not.toThrow();
    expect(result?.ok).toBe(false);
    expect(observed).toEqual([]);
    expect(applied).toEqual([]);
  };

  test("rejects altered content paired with the original content digest", () => {
    const { lock, approvedPlan } = validCreatePlan();
    const change = approvedPlan.changes[0]!;
    const malformedPlan = {
      ...approvedPlan,
      changes: [{ ...change, content: `${change.content}forged` }],
    };

    expectRejectedBeforeEffects(malformedPlan, lock);
  });

  test.each([
    {
      label: "missing required field",
      mutate: (change: PlannedChange) => {
        const malformed = { ...change } as Record<string, unknown>;
        delete malformed.expectedCurrentDigest;
        return malformed;
      },
    },
    {
      label: "forbidden action field",
      mutate: (change: PlannedChange) => ({ ...change, renameTo: "generated/forbidden.mjs" }),
    },
    {
      label: "ambient field",
      mutate: (change: PlannedChange) => ({ ...change, ambientGrant: true }),
    },
  ])("rejects a change-class record with $label", ({ mutate }) => {
    const { lock, approvedPlan } = validCreatePlan();
    const malformedPlan = {
      ...approvedPlan,
      changes: [mutate(approvedPlan.changes[0]!)],
    } as unknown as ChangePlan;

    expectRejectedBeforeEffects(malformedPlan, lock);
  });

  test.each([
    {
      field: "path",
      mutate: (change: PlannedChange) => ({ ...change, path: "generated/tampered.mjs" }),
    },
    {
      field: "change class",
      mutate: (change: PlannedChange) => ({ ...change, change: "delete" as const }),
    },
    {
      field: "ownership",
      mutate: (change: PlannedChange) => ({ ...change, ownership: "user-owned" as const }),
    },
    {
      field: "rename target",
      mutate: (change: PlannedChange) => ({ ...change, renameTo: "generated/renamed.mjs" }),
    },
    {
      field: "current-digest precondition",
      mutate: (change: PlannedChange) => ({
        ...change,
        expectedCurrentDigest: sourceDigest,
      }),
    },
  ])("rejects a $field mutation under the reviewed plan digest", ({ mutate }) => {
    const { lock, approvedPlan } = validCreatePlan();
    const tamperedPlan = {
      ...approvedPlan,
      changes: [mutate(approvedPlan.changes[0]!)],
      planDigest: approvedPlan.planDigest,
    } as ChangePlan;

    expectRejectedBeforeEffects(tamperedPlan, lock, approvedPlan.planDigest);
  });

  test("rejects a mutated plan with a replacement digest against separate approval", () => {
    const { lock, approvedPlan } = validCreatePlan();
    const preview = {
      lockDigest: approvedPlan.lockDigest,
      changes: [{ ...approvedPlan.changes[0]!, path: "generated/recomputed-tamper.mjs" }],
    };
    const tamperedPlan: ChangePlan = {
      ...preview,
      planDigest: fixtureContentDigest(preview),
    };

    expect(tamperedPlan.planDigest).not.toEqual(approvedPlan.planDigest);
    expectRejectedBeforeEffects(tamperedPlan, lock, approvedPlan.planDigest);
  });

  test("rejects conflict content that is present but not a string", () => {
    const lock = createLockFixture();
    const approvedPlan = planChanges({
      lock,
      desired: [{ path: "user.mjs", ownership: "user-owned", content: nativeContent }],
      workspace: { artifacts: [workspaceArtifact("user.mjs", "user-owned")] },
    });
    const change = { ...approvedPlan.changes[0]! } as Partial<PlannedChange>;
    Reflect.deleteProperty(change, "contentDigest");
    const malformed = {
      ...approvedPlan,
      changes: [{ ...change, content: 42 }],
    } as unknown as ChangePlan;

    expectRejectedBeforeEffects(malformed, lock, approvedPlan.planDigest);
  });

  test.each(["content", "contentDigest"] as const)(
    "rejects delete with forbidden %s present",
    (field) => {
      const lock = createLockFixture();
      const approvedPlan = planChanges({
        lock,
        desired: [],
        workspace: { artifacts: [workspaceArtifact("removed.mjs")] },
      });
      const forbidden = field === "content" ? nativeContent : sourceDigest;
      const malformed = {
        ...approvedPlan,
        changes: [{ ...approvedPlan.changes[0]!, [field]: forbidden }],
      } as ChangePlan;

      expectRejectedBeforeEffects(malformed, lock, approvedPlan.planDigest);
    },
  );
});
