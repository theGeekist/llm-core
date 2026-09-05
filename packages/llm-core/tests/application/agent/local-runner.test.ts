import { contractVersion, coreId, type EventId, type RunId } from "#contracts";
import { describe, expect, test } from "bun:test";
import type {
  AgentDefinition,
  AgentRunner,
  AgentStartRequest,
  PreparedAgentDefinition,
} from "../../../src/features/agent/public";
import { type LocalAgentProgramPort } from "../../support/local-agent/public";

import {
  IDS,
  INVOCATION_ID,
  UUID_V4,
  basicProgram,
  collect,
  identityPort,
  prepare,
  request,
  runner,
} from "../../support/local-runner-fixtures";

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
  test("rejects UUIDv4 values returned by run and event identity ports", async () => {
    const program: LocalAgentProgramPort = {
      execute: () => ({ status: "completed" }),
    };
    const runIdTarget = runner(program, {
      identity: {
        ...identityPort(),
        newRunId: () => coreId<RunId>(UUID_V4),
      },
    });
    const preparedForRun = await prepare(runIdTarget);
    expect(() => runIdTarget.start(request(preparedForRun, null))).toThrow(
      "must mint UUIDv7 run IDs",
    );

    const eventIdTarget = runner(program, {
      identity: {
        ...identityPort(),
        newEventId: () => coreId<EventId>(UUID_V4),
      },
    });
    const preparedForEvent = await prepare(eventIdTarget);
    expect(() => eventIdTarget.start(request(preparedForEvent, null))).toThrow(
      "must mint UUIDv7 event IDs",
    );
  });

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
          } as PreparedAgentDefinition,
          null,
        ),
      ),
    ).toThrow("prepared");
    expect(() => target.start(request(agent, { invalid: undefined } as never))).toThrow("portable");
  });

  test("rejects shaped or foreign prepared specs at every boundary", async () => {
    const target = runner(basicProgram());
    const other = runner(basicProgram());
    const portable: AgentDefinition = {
      agentId: "writer",
      version: contractVersion("2.0.0"),
      instructions: "Write.",
      effectRequirement: "read-only",
    };
    const staticallyRejected: AgentStartRequest = {
      // @ts-expect-error Portable authoring data has no runner preparation provenance.
      agent: portable,
      invocationContext: { invocationId: INVOCATION_ID },
      input: null,
    };
    const shaped = portable as PreparedAgentDefinition;
    const otherPrepared = await prepare(other);

    void staticallyRejected;
    expect(() => target.start(request(shaped, null))).toThrow("prepared");
    expect(() => target.start(request(otherPrepared, null))).toThrow("runner instance");
  });

  test("settles and closes atomically when the clock fails at terminal time", async () => {
    const port = identityPort();
    let clockCalls = 0;
    const target = runner(
      { execute: () => ({ status: "completed" }) },
      {
        identity: {
          ...port,
          now: () => {
            clockCalls += 1;
            return clockCalls >= 3 ? "bad-clock" : "2026-07-29T14:00:00.000Z";
          },
        },
      },
    );
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

    expect(() => target.start(request(agent, null))).toThrow("must mint UUIDv7 event IDs");
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
    expect(events.map((event) => event.kind)).toEqual(["agent.run.started", "agent.run.failed"]);
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
    const badRun = await badResultRunner.start(request(await prepare(badResultRunner), null));
    expect((await badRun.result()).status).toBe("failed");
    expect((await collect(badRun)).at(-1)?.kind).toBe("agent.run.failed");
  });
});
