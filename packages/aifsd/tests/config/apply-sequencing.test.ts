import { describe, expect, test } from "bun:test";

import {
  applyPlan,
  planChanges,
  type ChangeApplicationStatus,
  type ArtifactWriter,
} from "../../src/config/index.js";
import { createLockFixture } from "./fixtures/configuration.js";

describe("materialization application sequencing", () => {
  test("does not start a later asynchronous apply until its predecessor settles", async () => {
    const lock = createLockFixture();
    const plan = planChanges({
      lock,
      desired: [
        { path: "first.mjs", ownership: "aifsd-owned", content: "first\n" },
        { path: "second.mjs", ownership: "aifsd-owned", content: "second\n" },
      ],
      workspace: { artifacts: [] },
    });
    const events: string[] = [];
    let settleFirst: ((status: ChangeApplicationStatus) => void) | undefined;
    const writer: ArtifactWriter = {
      observe: () => null,
      apply: (change) => {
        events.push(`start:${change.path}`);
        if (change.path === "first.mjs") {
          return new Promise<ChangeApplicationStatus>((resolve) => {
            settleFirst = (status) => {
              events.push("settle:first.mjs");
              resolve(status);
            };
          });
        }
        return "applied";
      },
    };

    const pending = applyPlan(plan, {
      approvedPlanDigest: plan.planDigest,
      lock,
      writer,
    });

    expect(events).toEqual(["start:first.mjs"]);
    expect(settleFirst).toBeDefined();
    settleFirst!("applied");

    const result = await pending;
    expect(result.ok).toBe(true);
    expect(events).toEqual(["start:first.mjs", "settle:first.mjs", "start:second.mjs"]);
  });
});
