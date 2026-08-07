import { describe, expect, test } from "bun:test";
import { digest } from "@geekist/llm-core/contracts";

import { planChanges, type ChangePlan } from "../../src/config/index.js";
import { createLockFixture, fixtureContentDigest } from "./fixtures/configuration.js";

const oldDigest = digest("4".repeat(64));
const nativeContent = 'export const message = "materialized";\n';
const nativeDigest = fixtureContentDigest(nativeContent);

const createPlan = (): ChangePlan =>
  planChanges({
    lock: createLockFixture(),
    desired: [
      { path: "create.mjs", ownership: "aifsd-owned", content: nativeContent },
      { path: "unchanged.mjs", ownership: "aifsd-owned", content: nativeContent },
      { path: "stale.mjs", ownership: "aifsd-owned", content: nativeContent },
      { path: "shared.json", ownership: "shared", content: '{"changed":true}\n' },
      { path: "user.mjs", ownership: "user-owned", content: nativeContent },
      {
        path: "renamed.mjs",
        previousPath: "old-name.mjs",
        ownership: "aifsd-owned",
        content: nativeContent,
      },
    ],
    workspace: {
      artifacts: [
        { path: "unchanged.mjs", ownership: "aifsd-owned", contentDigest: nativeDigest },
        { path: "stale.mjs", ownership: "aifsd-owned", contentDigest: oldDigest },
        { path: "shared.json", ownership: "shared", contentDigest: oldDigest },
        { path: "user.mjs", ownership: "user-owned", contentDigest: oldDigest },
        { path: "old-name.mjs", ownership: "aifsd-owned", contentDigest: oldDigest },
        { path: "removed.mjs", ownership: "aifsd-owned", contentDigest: oldDigest },
      ],
    },
  });

describe("ownership-safe materialization planning", () => {
  test("classifies create, update, merge, conflict, unchanged, delete and rename explicitly", () => {
    const plan = createPlan();
    const byPath = new Map(plan.changes.map((change) => [change.path, change]));

    expect(byPath.get("create.mjs")?.change).toBe("create");
    expect(byPath.get("unchanged.mjs")?.change).toBe("unchanged");
    expect(byPath.get("stale.mjs")?.change).toBe("update-owned-region");
    expect(byPath.get("shared.json")?.change).toBe("merge");
    expect(byPath.get("user.mjs")?.change).toBe("conflict");
    expect(byPath.get("old-name.mjs")?.change).toBe("rename");
    expect(byPath.get("old-name.mjs")?.renameTo).toBe("renamed.mjs");
    expect(byPath.get("removed.mjs")?.change).toBe("delete");
    expect(
      Object.fromEntries([...byPath].map(([path, change]) => [path, change.reasonCode])),
    ).toEqual({
      "create.mjs": "artifact-absent",
      "unchanged.mjs": "content-already-current",
      "stale.mjs": "aifsd-owned-content-stale",
      "shared.json": "shared-content-requires-merge",
      "user.mjs": "user-owned-content-conflict",
      "old-name.mjs": "artifact-renamed",
      "removed.mjs": "artifact-no-longer-produced",
    });
  });

  test("retains preview-time observed digests as apply preconditions", () => {
    const plan = createPlan();
    const byPath = new Map(plan.changes.map((change) => [change.path, change]));

    expect(byPath.get("unchanged.mjs")?.expectedCurrentDigest).toEqual(nativeDigest);
    for (const path of ["stale.mjs", "shared.json", "user.mjs", "old-name.mjs", "removed.mjs"]) {
      expect(byPath.get(path)?.expectedCurrentDigest).toEqual(oldDigest);
    }
    expect(byPath.get("create.mjs")?.expectedCurrentDigest).toBeNull();
  });

  test("reports an absent user-owned target as a conflict rather than an applicable create", () => {
    const plan = planChanges({
      lock: createLockFixture(),
      desired: [{ path: "user.mjs", ownership: "user-owned", content: nativeContent }],
      workspace: { artifacts: [] },
    });

    expect(plan.changes).toEqual([
      {
        path: "user.mjs",
        ownership: "user-owned",
        change: "conflict",
        reasonCode: "user-owned-artifact-absent",
        expectedCurrentDigest: null,
      },
    ]);
  });

  test("snapshots and freezes plan inputs without retaining caller ownership", () => {
    const desired = [
      { path: "generated.mjs", ownership: "aifsd-owned" as const, content: nativeContent },
    ];
    const workspace = {
      artifacts: [
        { path: "generated.mjs", ownership: "aifsd-owned" as const, contentDigest: oldDigest },
      ],
    };
    const plan = planChanges({
      lock: createLockFixture(),
      desired,
      workspace,
    });

    desired[0]!.path = "mutated.mjs";
    desired[0]!.content = "mutated";
    workspace.artifacts[0]!.path = "mutated.mjs";

    expect(plan.changes[0]!.path).toBe("generated.mjs");
    expect(plan.changes[0]!.content).toBe(nativeContent);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.changes[0]!)).toBe(true);
  });
});
