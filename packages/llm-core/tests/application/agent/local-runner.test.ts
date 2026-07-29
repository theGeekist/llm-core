/* eslint-disable max-lines -- one adversarial suite exercises the complete runner lifecycle */
import { describe, expect, test } from "bun:test";
import {
  contractVersion,
  newCoreId,
  type EventId,
  type InvocationId,
  type RunId,
} from "#contracts";
import {
  createLocalAgentRunner,
  type AgentRunIdentityPort,
  type LocalAgentProgramPort,
} from "../../../src/application/agent/public";
import type { ExecuteControlledToolInput } from "../../../src/application/tool-execution/public";
import type {
  AgentRun,
  AgentRunner,
  AgentRunRequest,
  PreparedAgentSpec,
} from "../../../src/features/agent/public";
import {
  registerResumableCheckpoint,
  type RecordedEffectStatus,
} from "../../../src/features/state/public";
import { prepareAgentSpec } from "../../../src/features/agent/public";
import {
  COMPATIBILITY,
  STEP_ONE,
  checkpoint,
  decision,
  intervention,
  receipt,
} from "../../state/helpers";

const IDS = [
  "018f0f4e-8c5b-7a91-8c3b-123456789b01",
  "018f0f4e-8c5b-7a91-8c3b-123456789b02",
  "018f0f4e-8c5b-7a91-8c3b-123456789b03",
  "018f0f4e-8c5b-7a91-8c3b-123456789b04",
  "018f0f4e-8c5b-7a91-8c3b-123456789b05",
  "018f0f4e-8c5b-7a91-8c3b-123456789b06",
  "018f0f4e-8c5b-7a91-8c3b-123456789b07",
  "018f0f4e-8c5b-7a91-8c3b-123456789b08",
  "018f0f4e-8c5b-7a91-8c3b-123456789b09",
  "018f0f4e-8c5b-7a91-8c3b-123456789b0a",
] as const;
const INVOCATION_ID = newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789c01");

const identityPort = (): AgentRunIdentityPort => {
  let index = 0;
  return {
    newRunId: () => newCoreId<RunId>(IDS[index++] ?? IDS.at(-1)!),
    newEventId: () => newCoreId<EventId>(IDS[index++] ?? IDS.at(-1)!),
    now: () => "2026-07-29T14:00:00.000Z",
  };
};

const runner = (
  program: LocalAgentProgramPort,
  overrides: Partial<Parameters<typeof createLocalAgentRunner>[0]> = {},
) =>
  createLocalAgentRunner({
    identity: identityPort(),
    program,
    runnerId: "llm-core.local",
    runnerVersion: contractVersion("2.0.0"),
    ...overrides,
  });

const prepare = async (
  target: AgentRunner,
  effectRequirement: "read-only" | "controlled" = "read-only",
): Promise<PreparedAgentSpec> =>
  target.prepare({
    agentId: "test-agent",
    version: contractVersion("2.0.0"),
    instructions: "Complete the request.",
    effectRequirement,
  });

const request = (agent: PreparedAgentSpec, input: AgentRunRequest["input"]): AgentRunRequest => ({
  agent,
  invocationContext: { invocationId: INVOCATION_ID },
  input,
});

const collect = async (run: AgentRun) => {
  const events = [];
  for await (const event of run.events()) {
    events.push(event);
  }
  return events;
};

const lifecycleContract = (name: string, create: () => AgentRunner) => {
  describe(`${name} runner contract`, () => {
    test("discovers, prepares, starts, emits and terminates exactly once", async () => {
      const target = create();
      const capabilities = await target.capabilities();
      const agent = await prepare(target);
      const run = await target.start(request(agent, { prompt: "hello" }));

      expect(capabilities.childRuns).toBe(true);
      expect((await run.result()).status).toBe("completed");
      const events = await collect(run);
      expect(events.map((event) => event.kind)).toEqual([
        "agent.run.started",
        "agent.run.progress",
        "agent.run.completed",
      ]);
      expect(events.map((event) => event.sequence)).toEqual([0, 1, 2]);
      expect(events.every((event) => event.identity.runId === run.identity.runId)).toBe(true);
    });
  });
};

const basicProgram = (): LocalAgentProgramPort => ({
  execute(context) {
    context.emitProgress({ code: "working" });
    return { status: "completed", output: { ok: true } };
  },
});

lifecycleContract("local", () => runner(basicProgram()));
lifecycleContract("fake remote", () => {
  const local = runner(basicProgram());
  return {
    capabilities: async () => local.capabilities(),
    prepare: async (spec) => local.prepare(spec),
    start: async (input) => local.start(input),
    ...(local.resume ? { resume: async (input) => local.resume!(input) } : {}),
  };
});

describe("createLocalAgentRunner", () => {
  test("fails closed when a meaningful-effect path was not explicitly configured", async () => {
    const target = runner(basicProgram());
    expect(() =>
      target.prepare({
        agentId: "writer",
        version: contractVersion("2.0.0"),
        instructions: "Write.",
        effectRequirement: "controlled",
      }),
    ).toThrow("controlled path");
    expect((await target.capabilities()).controlledEffects).toBe(false);
  });

  test("rejects forged prepared specs and non-portable run input", async () => {
    const target = runner(basicProgram());
    const agent = await prepare(target);

    expect(() =>
      target.start(
        request(
          {
            ...agent,
            instructions: "forged",
          } as PreparedAgentSpec,
          null,
        ),
      ),
    ).toThrow("prepared");
    expect(() =>
      target.start(request(agent, { invalid: undefined } as never)),
    ).toThrow("portable");
  });

  test("rejects specs prepared globally or by another runner at every boundary", async () => {
    const target = runner(basicProgram());
    const other = runner(basicProgram());
    const globallyPrepared = prepareAgentSpec({
      agentId: "writer",
      version: contractVersion("2.0.0"),
      instructions: "Write.",
      effectRequirement: "controlled",
    });
    const otherPrepared = await prepare(other);

    expect(() => target.start(request(globallyPrepared, null))).toThrow("runner instance");
    expect(() => target.start(request(otherPrepared, null))).toThrow("runner instance");
  });

  test("acknowledges cancellation separately and lets the program settle cancelled", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const target = runner({
      async execute(context) {
        await pending;
        return context.cancellation.isCancellationRequested()
          ? { status: "cancelled" }
          : { status: "completed" };
      },
    });
    const run = await target.start(request(await prepare(target), null));

    expect(
      await run.cancel({ requestedAt: "2026-07-29T14:00:01.000Z", reason: "operator-request" }),
    ).toMatchObject({ status: "acknowledged" });
    release();

    expect((await run.result()).status).toBe("cancelled");
    const events = await collect(run);
    expect(events.map((event) => event.kind)).toEqual([
      "agent.run.started",
      "agent.run.cancellation.requested",
      "agent.run.cancellation.acknowledged",
      "agent.run.cancelled",
    ]);
    expect(events[1]?.facts).toEqual({
      requestedAt: "2026-07-29T14:00:01.000Z",
      reasonProvided: true,
    });
  });

  test("rejects malformed cancellation controls before mutation or emission", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const target = runner({
      async execute() {
        await pending;
        return { status: "completed" };
      },
    });
    const run = await target.start(request(await prepare(target), null));

    expect(() =>
      run.cancel({
        requestedAt: "2026-07-29T14:00:01.000Z",
        reason: { apiKey: "secret" },
      } as never),
    ).toThrow("closed");
    release();
    await run.result();

    expect((await collect(run)).map((event) => event.kind)).toEqual([
      "agent.run.started",
      "agent.run.completed",
    ]);
  });

  test("does not mutate cancellation state unless both control events are valid", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let eventIds = 0;
    const target = runner(
      {
        async execute(context) {
          await pending;
          return {
            status: context.cancellation.isCancellationRequested()
              ? "cancelled"
              : "completed",
          };
        },
      },
      {
        identity: {
          ...identityPort(),
          newEventId: () => {
            eventIds += 1;
            return (eventIds === 3 ? "invalid-event-id" : IDS[eventIds]!) as EventId;
          },
        },
      },
    );
    const run = await target.start(request(await prepare(target), null));

    expect(() =>
      run.cancel({ requestedAt: "2026-07-29T14:00:01.000Z" }),
    ).toThrow("canonical event IDs");
    release();

    expect((await run.result()).status).toBe("completed");
    expect((await collect(run)).map((event) => event.kind)).toEqual([
      "agent.run.started",
      "agent.run.completed",
    ]);
  });

  test("accepts only run-bound typed interventions when enabled", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let observed = 0;
    const target = runner(
      {
        async execute(context) {
          const baseRequest = intervention();
          await context.requestIntervention({
            ...baseRequest,
            intervention: {
              ...baseRequest.intervention,
              runId: context.identity.runId,
            },
            requestedAt: "2026-07-29T14:00:00.000Z",
            expiresAt: "2026-07-29T15:00:00.000Z",
          });
          await pending;
          observed = context.receivedInterventions().length;
          return { status: "completed" };
        },
      },
      { interventions: true },
    );
    const run = await target.start(request(await prepare(target), null));
    const base = decision("approve");
    const bound = {
      ...base,
      decidedAt: "2026-07-29T14:00:00.000Z",
      intervention: { ...base.intervention, runId: run.identity.runId },
    };
    const wrongDigest = {
      ...bound,
      intervention: {
        ...bound.intervention,
        actionDigest: {
          ...bound.intervention.actionDigest,
          value: "B".repeat(43),
        },
      },
    } as typeof bound;

    expect((await run.intervene(wrongDigest)).status).toBe("rejected");
    expect((await run.intervene(bound)).status).toBe("accepted");
    expect((await run.intervene(decision("approve"))).status).toBe("rejected");
    release();
    await run.result();

    expect(observed).toBe(1);
    const events = await collect(run);
    const requested = events.find(
      (event) => event.kind === "agent.run.intervention.requested",
    );
    expect(requested?.facts).toMatchObject({
      checkpointRevision: 3,
      runId: run.identity.runId,
      requestedAt: "2026-07-29T14:00:00.000Z",
      expiresAt: "2026-07-29T15:00:00.000Z",
    });
    expect(JSON.stringify(requested)).not.toContain("reason");
  });

  test("validates forged child requests before recursion", async () => {
    let rejected = false;
    const target = runner({
      async execute(context) {
        if ((context.request.input as { kind: string }).kind === "parent") {
          try {
            await context.startChild(
              request(
                prepareAgentSpec({
                  agentId: "forged-child",
                  version: contractVersion("2.0.0"),
                  instructions: "Bypass.",
                  effectRequirement: "read-only",
                }),
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
          return { status: "completed", output: { child: true } };
        }
        const child = await context.startChild(
          request(context.request.agent, { kind: "child" }),
        );
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
          async resume(context) {
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

  test("settles and closes atomically when the clock fails at terminal time", async () => {
    const port = identityPort();
    let clockCalls = 0;
    const target = runner({ execute: () => ({ status: "completed" }) }, {
      identity: {
        ...port,
        now: () => {
          clockCalls += 1;
          return clockCalls >= 3 ? "bad-clock" : "2026-07-29T14:00:00.000Z";
        },
      },
    });
    const run = await target.start(request(await prepare(target), null));

    expect((await run.result()).status).toBe("completed");
    const events = await Promise.race([
      collect(run),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("event stream did not close")), 100),
      ),
    ]);
    expect(events.at(-1)?.kind).toBe("agent.run.completed");
  });

  test("reserves a valid terminal identity before executing the program", async () => {
    let eventIds = 0;
    let executed = false;
    const target = runner(
      {
        execute: () => {
          executed = true;
          return { status: "completed" };
        },
      },
      {
        identity: {
          ...identityPort(),
          newEventId: () => {
            eventIds += 1;
            return (eventIds === 1 ? IDS[0] : "invalid-event-id") as EventId;
          },
        },
      },
    );
    const agent = await prepare(target);

    expect(() => target.start(request(agent, null))).toThrow("canonical event IDs");
    expect(executed).toBe(false);
  });

  test("rejects arbitrary or secret-bearing progress facts", async () => {
    const target = runner({
      execute(context) {
        context.emitProgress({
          code: "working",
          apiKey: "secret",
        } as never);
        return { status: "completed" };
      },
    });
    const run = await target.start(request(await prepare(target), null));

    expect((await run.result()).status).toBe("failed");
    const events = await collect(run);
    expect(events.map((event) => event.kind)).toEqual([
      "agent.run.started",
      "agent.run.failed",
    ]);
    expect(JSON.stringify(events)).not.toContain("secret");
  });

  test("rejects nested credential fields and invalid opaque terminal handles", async () => {
    const target = runner(basicProgram());
    const agent = await prepare(target);
    expect(() =>
      target.start({
        ...request(agent, null),
        invocationContext: {
          invocationId: INVOCATION_ID,
          principal: { principalId: "operator", apiKey: "secret" },
        } as never,
      }),
    ).toThrow("portable");

    const badResultRunner = runner({
      execute: () =>
        ({
          status: "completed",
          durableExecution: {
            kind: "durable-execution-handle",
            durableJobId: IDS[0],
            runtime: { runtimeId: "local", runtimeVersion: "2.0.0" },
            opaqueHandle: "job",
            credential: "secret",
          },
        }) as never,
    });
    const badRun = await badResultRunner.start(
      request(await prepare(badResultRunner), null),
    );
    expect((await badRun.result()).status).toBe("failed");
    expect((await collect(badRun)).at(-1)?.kind).toBe("agent.run.failed");
  });
});
