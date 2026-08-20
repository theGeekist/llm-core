import { describe, expect, test } from "bun:test";
import type { RuntimeNeutralProjectView } from "../../packages/aifsd/src/project-semantics/public.js";
import { commandKind, renderProjectFacts } from "./browser-consumer.js";
import { mobileCommandKind, toMobileProjectScreen } from "./mobile-consumer.js";

const view = {
  projectId: "consumer-qualification",
  journalCheckpoint: {
    projectId: "consumer-qualification",
    position: 3,
    lastEventId: null,
    journalDigest: {
      algorithm: "sha-256",
      value: "0".repeat(64),
    },
  },
  projectionProtocolVersion: "aifsd.project-projection/1",
  projectionDigest: {
    algorithm: "sha-256",
    value: "1".repeat(64),
  },
  projectionFresh: true,
  tasks: [
    {
      taskId: "task-a",
      readiness: "contradictory",
      completion: "contradictory",
      dependencies: [],
      blockers: [],
      sourceEventIds: [],
      preconditionAssertionIds: [],
      contradictionAssertionIds: ["complete", "incomplete"],
    },
  ],
  assertions: [],
  reconciliation: null,
} as unknown as RuntimeNeutralProjectView;

describe("runtime-neutral project consumers", () => {
  test("executes the browser view and command boundary", () => {
    expect(JSON.parse(renderProjectFacts(view))).toEqual({
      projectId: "consumer-qualification",
      checkpoint: 3,
      projectionFresh: true,
      tasks: [
        {
          taskId: "task-a",
          readiness: "contradictory",
          completion: "contradictory",
        },
      ],
    });
    expect(commandKind({ kind: "submit-observation", observation: {} as never })).toBe(
      "submit-observation",
    );
  });

  test("executes the mobile view and command boundary", () => {
    expect(toMobileProjectScreen(view)).toEqual({
      projectId: "consumer-qualification",
      checkpoint: 3,
      projectionFresh: true,
      contradictionCount: 1,
    });
    expect(mobileCommandKind({ kind: "propose-decision", observation: {} as never })).toBe(
      "propose-decision",
    );
  });
});
