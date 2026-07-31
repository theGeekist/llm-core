import { describe, expect, test } from "bun:test";
import { createDeterministicFakeRemoteRunner } from "../../src/adapters/runtimes";
import { registerResumableCheckpoint } from "../../src/features/state/runtime";
import { isUuidV7 } from "#contracts";
import {
  assertPortableRunnerConformance,
  collectEvents,
  fakeRemoteTarget,
  localTarget,
  prepare,
  pythonTransportTarget,
  resumeSafetyTarget,
  runRequest,
} from "./runner-fixtures";

describe("shared model/tool/control/event/state/continuation conformance", () => {
  test("local TypeScript runner", async () => {
    await assertPortableRunnerConformance(localTarget, true);
  });

  test("deterministic fake-remote runner", async () => {
    await assertPortableRunnerConformance(fakeRemoteTarget, true);
  });

  test("real Python stdlib process transport (not PydanticAI runtime conformance)", async () => {
    await assertPortableRunnerConformance(pythonTransportTarget);
  });
});

describe("deterministic fake-remote faults", () => {
  test("models at-least-once replay without hiding duplicate event identity", async () => {
    const local = localTarget();
    const remote = createDeterministicFakeRemoteRunner(local.runner, {
      replayEventSequences: [1],
    });
    const run = await remote.start(runRequest(await prepare(remote)));
    const events = await collectEvents(run);

    expect(events.map((event) => event.sequence)).toEqual([0, 1, 1, 2, 3]);
    expect(events[1]?.eventId).toBe(events[2]?.eventId);
  });

  test("models drop, reorder, timeout and operation correlation failures deterministically", async () => {
    const droppedTarget = localTarget();
    const dropped = createDeterministicFakeRemoteRunner(droppedTarget.runner, {
      dropEventSequences: [1],
    });
    expect(
      (await collectEvents(await dropped.start(runRequest(await prepare(dropped))))).map(
        (event) => event.sequence,
      ),
    ).toEqual([0, 2, 3]);

    const reorderedTarget = localTarget();
    const reordered = createDeterministicFakeRemoteRunner(reorderedTarget.runner, {
      reverseEventOrder: true,
    });
    expect(
      (await collectEvents(await reordered.start(runRequest(await prepare(reordered))))).map(
        (event) => event.sequence,
      ),
    ).toEqual([3, 2, 1, 0]);

    const timedOut = createDeterministicFakeRemoteRunner(localTarget().runner, {
      fail: { result: "transport-timeout" },
    });
    const timedOutRun = await timedOut.start(runRequest(await prepare(timedOut)));
    await expect(timedOutRun.result()).rejects.toEqual(
      expect.objectContaining({
        operation: "result",
        code: "transport-timeout",
      }),
    );
  });

  test("fails closed for controlled effects and foreign prepared specs", async () => {
    const first = fakeRemoteTarget();
    const second = fakeRemoteTarget();

    await expect(prepare(first.runner, "controlled")).rejects.toThrow("controlled path");
    const foreign = await prepare(second.runner);
    await expect(first.runner.start(runRequest(foreign))).rejects.toThrow(
      "prepared by this boundary",
    );
  });
});

describe("state and continuation safety parity", () => {
  for (const [name, remote] of [
    ["local", false],
    ["fake remote", true],
  ] as const) {
    test(`${name} rejects incompatible resume and never replays a completed effect`, async () => {
      const incompatibleTarget = resumeSafetyTarget(remote);
      const agent = await prepare(incompatibleTarget.runner, "controlled");
      const incompatible = structuredClone(incompatibleTarget.checkpoint);
      (
        incompatible.compatibility.runtime as {
          runtimeId: string;
        }
      ).runtimeId = "other.runtime";
      const denied = await incompatibleTarget.runner.resume!({
        agent,
        invocationContext: runRequest(agent).invocationContext,
        checkpoint: registerResumableCheckpoint(incompatible),
      });
      expect(await denied.result()).toMatchObject({
        status: "denied",
        reasonCode: "resume-runtime-id-mismatch",
      });

      const replayTarget = resumeSafetyTarget(remote);
      const replayAgent = await prepare(replayTarget.runner, "controlled");
      const resumed = await replayTarget.runner.resume!({
        agent: replayAgent,
        invocationContext: runRequest(replayAgent).invocationContext,
        checkpoint: replayTarget.checkpoint,
      });
      expect((await resumed.result()).status).toBe("completed");
      expect(replayTarget.observations).toEqual({
        effectExecutions: 0,
        replayRejections: 1,
      });
    });
  }
});

describe("Python bridge core identities", () => {
  test("identical starts mint distinct UUIDv7 run and event identities", async () => {
    const target = pythonTransportTarget();
    try {
      const agent = await prepare(target.runner);
      const request = runRequest(agent);
      const first = await target.runner.start(request);
      const second = await target.runner.start(request);
      const [firstEvents, secondEvents] = await Promise.all([
        collectEvents(first),
        collectEvents(second),
      ]);

      expect(isUuidV7(first.identity.runId)).toBe(true);
      expect(isUuidV7(second.identity.runId)).toBe(true);
      expect(first.identity.runId).not.toBe(second.identity.runId);
      const eventIds = [...firstEvents, ...secondEvents].map((event) => event.eventId);
      expect(eventIds.every(isUuidV7)).toBe(true);
      expect(new Set(eventIds).size).toBe(eventIds.length);
    } finally {
      await target.close();
    }
  });
});
