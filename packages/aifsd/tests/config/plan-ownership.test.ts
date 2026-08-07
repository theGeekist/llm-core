import { describe, expect, test } from "bun:test";
import { digest } from "@geekist/llm-core/contracts";

import { planChanges } from "../../src/config/index.js";
import { createLockFixture } from "./fixtures/configuration.js";

describe("materialization plan ownership", () => {
  test("does not freeze or retain a caller-owned nested observed digest", () => {
    const observedDigest = digest("4".repeat(64));
    const workspace = {
      artifacts: [
        {
          path: "generated.mjs",
          ownership: "aifsd-owned" as const,
          contentDigest: observedDigest,
        },
      ],
    };
    const plan = planChanges({
      lock: createLockFixture(),
      desired: [{ path: "generated.mjs", ownership: "aifsd-owned", content: "next\n" }],
      workspace,
    });
    const plannedDigest = plan.changes[0]!.expectedCurrentDigest;

    expect(plannedDigest).toEqual(observedDigest);
    expect(plannedDigest).not.toBe(observedDigest);
    expect(Object.isFrozen(observedDigest)).toBe(false);

    (observedDigest as { value: string }).value = "5".repeat(64);
    expect(plan.changes[0]!.expectedCurrentDigest).not.toEqual(observedDigest);
  });
});
