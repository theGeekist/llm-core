import { describe, expect, test } from "bun:test";
import { digest } from "@aifsd/llm-core/contracts";

import {
  applyPlan,
  planChanges,
  type ConfigurationLock,
  type ConfigurationResult,
  type DesiredArtifact,
  type ChangePlan,
  type ApplyResult,
  type ArtifactWriter,
  type MaybePromise,
  type PlannedChange,
  type WorkspaceArtifact,
} from "../../src/config/index.js";
import { createLockFixture, fixtureContentDigest } from "./fixtures/configuration.js";

const nativeContent = 'export const message = "materialized";\n';
const oldDigest = digest("4".repeat(64));

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

const plannedChange = (
  lock: ConfigurationLock,
  desired: readonly DesiredArtifact[],
  artifacts: readonly WorkspaceArtifact[],
): PlannedChange => {
  const plan = planChanges({
    lock,
    desired,
    workspace: { artifacts },
  });
  expect(plan.changes).toHaveLength(1);
  return plan.changes[0]!;
};

const createChange = (lock: ConfigurationLock, path = "generated/new.mjs") =>
  plannedChange(lock, [{ path, ownership: "aifsd-owned", content: nativeContent }], []);

const updateChange = (lock: ConfigurationLock, path = "generated/existing.mjs") =>
  plannedChange(
    lock,
    [{ path, ownership: "aifsd-owned", content: nativeContent }],
    [{ path, ownership: "aifsd-owned", contentDigest: oldDigest }],
  );

const mergeChange = (lock: ConfigurationLock) =>
  plannedChange(
    lock,
    [{ path: "shared.mjs", ownership: "shared", content: nativeContent }],
    [{ path: "shared.mjs", ownership: "shared", contentDigest: oldDigest }],
  );

const userConflictChange = (lock: ConfigurationLock, present: boolean) =>
  plannedChange(
    lock,
    [{ path: "user.mjs", ownership: "user-owned", content: nativeContent }],
    present ? [{ path: "user.mjs", ownership: "user-owned", contentDigest: oldDigest }] : [],
  );

const deleteChange = (lock: ConfigurationLock) =>
  plannedChange(
    lock,
    [],
    [{ path: "removed.mjs", ownership: "aifsd-owned", contentDigest: oldDigest }],
  );

const renameChange = (lock: ConfigurationLock, source: string, destination: string) =>
  plannedChange(
    lock,
    [
      {
        path: destination,
        previousPath: source,
        ownership: "aifsd-owned",
        content: nativeContent,
      },
    ],
    [{ path: source, ownership: "aifsd-owned", contentDigest: oldDigest }],
  );

const sealPlan = (lock: ConfigurationLock, changes: readonly PlannedChange[]): ChangePlan => {
  const seed = planChanges({
    lock,
    desired: [],
    workspace: { artifacts: [] },
  });
  const preview = { lockDigest: seed.lockDigest, changes };
  return { ...preview, planDigest: fixtureContentDigest(preview) };
};

const expectRejectedBeforeEffects = (lock: ConfigurationLock, plan: ChangePlan): void => {
  const observed: string[] = [];
  const applied: PlannedChange[] = [];
  let result: ConfigurationResult<ApplyResult> | undefined;
  expect(() => {
    result = synchronous(
      applyPlan(plan, {
        approvedPlanDigest: plan.planDigest,
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

describe("materialization apply semantic boundary", () => {
  test("observes unchanged artifacts and rejects drift before reporting them as skipped", () => {
    const lock = createLockFixture();
    const desiredContent = "already current\n";
    const currentDigest = fixtureContentDigest(desiredContent);
    const plan = planChanges({
      lock,
      desired: [{ path: "unchanged.mjs", ownership: "aifsd-owned", content: desiredContent }],
      workspace: {
        artifacts: [
          { path: "unchanged.mjs", ownership: "aifsd-owned", contentDigest: currentDigest },
        ],
      },
    });
    const observed: string[] = [];
    let applyCalls = 0;
    const writer: ArtifactWriter = {
      observe: (path) => {
        observed.push(path);
        return digest("5".repeat(64));
      },
      apply: () => {
        applyCalls += 1;
        return "applied";
      },
    };

    const result = synchronous(
      applyPlan(plan, { approvedPlanDigest: plan.planDigest, lock, writer }),
    );

    expect(plan.changes[0]!.change).toBe("unchanged");
    expect(observed).toEqual(["unchanged.mjs"]);
    expect(applyCalls).toBe(0);
    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          code: "stale-plan",
          reasonCode: "plan-precondition-stale",
          path: "unchanged.mjs",
        },
      ],
    });
  });

  test.each([
    {
      label: "shared delete",
      change: (lock: ConfigurationLock) => ({
        ...deleteChange(lock),
        ownership: "shared" as const,
      }),
    },
    {
      label: "shared update-owned-region",
      change: (lock: ConfigurationLock) => ({
        ...updateChange(lock),
        ownership: "shared" as const,
      }),
    },
    {
      label: "AIFSD-owned merge",
      change: (lock: ConfigurationLock) => ({
        ...mergeChange(lock),
        ownership: "aifsd-owned" as const,
      }),
    },
    {
      label: "create with a non-null precondition",
      change: (lock: ConfigurationLock) => ({
        ...createChange(lock),
        expectedCurrentDigest: oldDigest,
      }),
    },
    {
      label: "non-create with a null precondition",
      change: (lock: ConfigurationLock) => ({
        ...updateChange(lock),
        expectedCurrentDigest: null,
      }),
    },
    {
      label: "reason code from another change class",
      change: (lock: ConfigurationLock) => ({
        ...createChange(lock),
        reasonCode: "artifact-renamed" as const,
      }),
    },
    {
      label: "reason code contradicting ownership",
      change: (lock: ConfigurationLock) => ({
        ...mergeChange(lock),
        change: "conflict" as const,
        reasonCode: "user-owned-content-conflict" as const,
      }),
    },
    {
      label: "present user-owned conflict with an absent precondition",
      change: (lock: ConfigurationLock) => ({
        ...userConflictChange(lock, true),
        expectedCurrentDigest: null,
      }),
    },
    {
      label: "absent user-owned conflict with a present precondition",
      change: (lock: ConfigurationLock) => ({
        ...userConflictChange(lock, false),
        expectedCurrentDigest: oldDigest,
      }),
    },
  ])("rejects $label before effects", ({ change }) => {
    const lock = createLockFixture();
    expectRejectedBeforeEffects(lock, sealPlan(lock, [change(lock)]));
  });

  test("rejects an unrestricted prose reason before effects", () => {
    const lock = createLockFixture();
    const change = {
      ...createChange(lock),
      reasonCode: "the file looked absent to me",
    } as unknown as PlannedChange;
    expectRejectedBeforeEffects(lock, sealPlan(lock, [change]));
  });

  test("rejects duplicate source paths before effects", () => {
    const lock = createLockFixture();
    const change = createChange(lock);
    expectRejectedBeforeEffects(lock, sealPlan(lock, [change, { ...change }]));
  });

  test("rejects duplicate rename destinations before effects", () => {
    const lock = createLockFixture();
    const first = renameChange(lock, "old-one.mjs", "shared-target.mjs");
    const second = renameChange(lock, "old-two.mjs", "other-target.mjs");
    expectRejectedBeforeEffects(
      lock,
      sealPlan(lock, [first, { ...second, renameTo: first.renameTo }]),
    );
  });

  test("rejects a rename destination colliding with another source", () => {
    const lock = createLockFixture();
    const rename = renameChange(lock, "old-name.mjs", "generated/new.mjs");
    if (rename.renameTo === undefined) {
      throw new Error("Fixture requires a rename destination");
    }
    const collidingSource = createChange(lock, rename.renameTo);
    expectRejectedBeforeEffects(lock, sealPlan(lock, [rename, collidingSource]));
  });
});
