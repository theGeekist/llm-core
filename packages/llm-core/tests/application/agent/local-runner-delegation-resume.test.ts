import { contractVersion } from "#contracts";
import { describe, expect, test } from "bun:test";
import type { ExecuteControlledToolInput } from "../../../src/application/tool-execution/public";
import type { AgentRun, PreparedAgentDefinition } from "../../../src/features/agent/public";
import { type RecordedEffectStatus } from "../../../src/features/state/public";
import { registerResumableCheckpoint } from "../../../src/features/state/runtime";
import {
  COMPATIBILITY,
  STEP_ONE,
  checkpoint,
  receipt,
} from "../../state/resumable-checkpoint-fixtures";

import { INVOCATION_ID, prepare, request, runner } from "../../support/local-runner-fixtures";

describe("createLocalAgentRunner", () => {
  test("validates forged child requests before recursion", async () => {
    let rejected = false;
    const target = runner({
      async execute(context) {
        if ((context.request.input as { kind: string }).kind === "parent") {
          try {
            await context.startChild(
              request(
                {
                  agentId: "forged-child",
                  version: contractVersion("2.0.0"),
                  instructions: "Bypass.",
                  effectRequirement: "read-only",
                } as PreparedAgentDefinition,
                { kind: "child" },
              ),
            );
          } catch {
            rejected = true;
          }
        }
        return { status: "completed" };
      },
    });
    const parent = await target.start(request(await prepare(target), { kind: "parent" }));

    await parent.result();

    expect(rejected).toBe(true);
  });

  test("routes child execution through the runner with explicit causal identity", async () => {
    let childIdentity: AgentRun["identity"] | undefined;
    const target = runner({
      async execute(context) {
        if ((context.request.input as { kind: string }).kind === "child") {
          return { status: "completed", output: { kind: "json", value: { child: true } } };
        }
        const child = await context.startChild(request(context.request.agent, { kind: "child" }));
        childIdentity = child.identity;
        await child.result();
        return { status: "completed" };
      },
    });
    const parent = await target.start(request(await prepare(target), { kind: "parent" }));

    await parent.result();

    expect(childIdentity?.parentRunId).toBe(parent.identity.runId);
    expect(childIdentity?.causalRunId).toBe(parent.identity.runId);
    expect(childIdentity?.runId).not.toBe(parent.identity.runId);
  });

  test("rejects incompatible resume before invoking the resume program", async () => {
    let resumed = false;
    const target = runner(
      {
        execute: () => ({ status: "completed" }),
        resume: () => {
          resumed = true;
          return { status: "completed" };
        },
      },
      { resumeCompatibility: COMPATIBILITY },
    );
    const agent = await prepare(target);
    const incompatible = structuredClone(checkpoint());
    (
      incompatible.compatibility.runtime as {
        runtimeId: string;
      }
    ).runtimeId = "other.runtime";
    const run = await target.resume!({
      agent,
      invocationContext: { invocationId: INVOCATION_ID },
      checkpoint: registerResumableCheckpoint(incompatible),
    });

    expect(await run.result()).toMatchObject({
      status: "denied",
      reasonCode: "resume-runtime-id-mismatch",
    });
    expect(resumed).toBe(false);
  });

  for (const status of ["completed", "started", "indeterminate"] satisfies RecordedEffectStatus[]) {
    test(`blocks ${status} effect replay through the controlled tool port`, async () => {
      const registered = registerResumableCheckpoint(
        checkpoint({
          completedStepIds: status === "completed" ? [STEP_ONE] : [],
          recordedEffects: [receipt(STEP_ONE, status)],
        }),
      );
      let effectCalls = 0;
      let replayRejected = false;
      const target = runner(
        {
          execute: () => ({ status: "completed" }),
          async resume({ context }) {
            try {
              await context.controlledToolExecution!.execute({
                call: { invocation: { stepId: STEP_ONE } },
              } as ExecuteControlledToolInput);
            } catch {
              replayRejected = true;
            }
            return { status: "completed", checkpoint: registered };
          },
        },
        {
          resumeCompatibility: COMPATIBILITY,
          controlledToolExecution: {
            execute: () => {
              effectCalls += 1;
              throw new Error("must not execute");
            },
          },
        },
      );
      const run = await target.resume!({
        agent: await prepare(target, "controlled"),
        invocationContext: { invocationId: INVOCATION_ID },
        checkpoint: registered,
      });

      expect((await run.result()).status).toBe("completed");
      expect(replayRejected).toBe(true);
      expect(effectCalls).toBe(0);
    });
  }
});
