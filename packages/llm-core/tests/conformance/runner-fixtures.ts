import { expect } from "bun:test";
import {
  contractVersion,
  newCoreId,
  type EventId,
  type InvocationId,
  type RunId,
} from "#contracts";
import {
  createDeterministicFakeRemoteRunner,
  createNdjsonStdioTransport,
  createPythonTransportConformanceRunner,
  type ClosablePydanticAiBridgeTransport,
} from "../../src/adapters/runtimes";
import {
  createLocalAgentRunner,
  type AgentRunIdentityPort,
  type LocalAgentProgramPort,
} from "../../src/application/agent/public";
import type {
  AgentRun,
  AgentRunner,
  AgentRunRequest,
  PreparedAgentSpec,
} from "../../src/features/agent/public";
import { registerResumableCheckpoint } from "../../src/features/state/public";
import type { ExecuteControlledToolInput } from "../../src/application/tool-execution/public";
import { COMPATIBILITY, STEP_ONE, checkpoint, receipt } from "../state/helpers";

const INVOCATION_ID = newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789d01");
const IDS = [
  "018f0f4e-8c5b-7a91-8c3b-123456789d02",
  "018f0f4e-8c5b-7a91-8c3b-123456789d03",
  "018f0f4e-8c5b-7a91-8c3b-123456789d04",
  "018f0f4e-8c5b-7a91-8c3b-123456789d05",
] as const;

export interface ConformanceTarget {
  readonly runner: AgentRunner;
  close(): Promise<void>;
}

export interface ResumeSafetyTarget extends ConformanceTarget {
  readonly checkpoint: ReturnType<typeof registerResumableCheckpoint>;
  readonly observations: {
    effectExecutions: number;
    replayRejections: number;
  };
}

const identity = (): AgentRunIdentityPort => {
  let index = 0;
  return {
    newRunId: () => newCoreId<RunId>(IDS[index++] ?? IDS.at(-1)!),
    newEventId: () => newCoreId<EventId>(IDS[index++] ?? IDS.at(-1)!),
    now: () => "2026-07-30T00:00:00.000Z",
  };
};

const program: LocalAgentProgramPort = {
  async execute(context) {
    await context.emitProgress({ code: "runtime.model.completed" });
    await context.emitProgress({ code: "runtime.tool.completed" });
    return {
      status: "completed",
      output: {
        runtime: "typescript-local",
        input: context.request.input,
        model: { kind: "text", text: "deterministic" },
        tool: { name: "echo", result: context.request.input },
        control: { effect: "read-only", status: "allowed" },
        state: { kind: "snapshot", resumable: false },
        continuation: { status: "unsupported" },
      },
    };
  },
};

export const localTarget = (): ConformanceTarget => ({
  runner: createLocalAgentRunner({
    identity: identity(),
    program,
    runnerId: "llm-core.local.conformance",
    runnerVersion: contractVersion("2.0.0"),
  }),
  close: async () => undefined,
});

export const fakeRemoteTarget = (): ConformanceTarget => {
  const local = localTarget();
  return {
    runner: createDeterministicFakeRemoteRunner(local.runner),
    close: local.close,
  };
};

export const pythonTransportTarget = (): ConformanceTarget => {
  const script = new URL("../../src/adapters/runtimes/pydantic_ai_bridge.py", import.meta.url)
    .pathname;
  const transport: ClosablePydanticAiBridgeTransport = createNdjsonStdioTransport({
    command: process.env.LLM_CORE_PYDANTIC_AI_PYTHON ?? "python3",
    args: [script],
  });
  return {
    runner: createPythonTransportConformanceRunner(transport),
    close: () => transport.close(),
  };
};

export const resumeSafetyTarget = (remote: boolean): ResumeSafetyTarget => {
  const observations = { effectExecutions: 0, replayRejections: 0 };
  const registered = registerResumableCheckpoint(
    checkpoint({
      completedStepIds: [STEP_ONE],
      recordedEffects: [receipt(STEP_ONE, "completed")],
    }),
  );
  const local = createLocalAgentRunner({
    identity: identity(),
    runnerId: "llm-core.local.resume-conformance",
    runnerVersion: contractVersion("2.0.0"),
    resumeCompatibility: COMPATIBILITY,
    controlledToolExecution: {
      execute: () => {
        observations.effectExecutions += 1;
        throw new Error("recorded effects must not execute");
      },
    },
    program: {
      execute: () => ({ status: "completed" }),
      async resume({ context }) {
        try {
          await context.controlledToolExecution!.execute({
            call: { invocation: { stepId: STEP_ONE } },
          } as ExecuteControlledToolInput);
        } catch {
          observations.replayRejections += 1;
        }
        return { status: "completed", checkpoint: registered };
      },
    },
  });
  return {
    runner: remote ? createDeterministicFakeRemoteRunner(local) : local,
    checkpoint: registered,
    observations,
    close: async () => undefined,
  };
};

export const prepare = async (
  runner: AgentRunner,
  effectRequirement: "read-only" | "controlled" = "read-only",
): Promise<PreparedAgentSpec> =>
  runner.prepare({
    agentId: "conformance-agent",
    version: contractVersion("2.0.0"),
    instructions: "Exercise portable contracts.",
    effectRequirement,
  });

export const runRequest = (
  agent: PreparedAgentSpec,
  input: AgentRunRequest["input"] = { prompt: "hello" },
): AgentRunRequest => ({
  agent,
  invocationContext: { invocationId: INVOCATION_ID },
  input,
});

export const collectEvents = async (run: AgentRun) => {
  const events = [];
  for await (const event of run.events()) {
    events.push(event);
  }
  return events;
};

export const assertPortableRunnerConformance = async (
  create: () => ConformanceTarget,
  verifyAllSemantics = false,
): Promise<void> => {
  const target = create();
  try {
    const capabilities = await target.runner.capabilities();
    const spec = await prepare(target.runner);
    const run = await target.runner.start(runRequest(spec));
    const [result, events] = await Promise.all([run.result(), collectEvents(run)]);

    expect(result.status).toBe("completed");
    expect(result.identity.runId).toBe(run.identity.runId);
    expect(result.output).toMatchObject({ model: { kind: "text" } });
    if (verifyAllSemantics) {
      expect(result.output).toMatchObject({
        tool: { name: "echo", result: { prompt: "hello" } },
        control: { effect: "read-only", status: "allowed" },
        state: { kind: "snapshot", resumable: false },
        continuation: { status: "unsupported" },
      });
    }
    expect(events.map((event) => event.kind)).toEqual([
      "agent.run.started",
      "agent.run.progress",
      "agent.run.progress",
      "agent.run.completed",
    ]);
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3]);
    expect(events.filter((event) => event.kind.endsWith("completed"))).toHaveLength(1);
    expect(events.every((event) => event.identity.runId === run.identity.runId)).toBe(true);
    const cancellation = run.cancel({ requestedAt: "2026-07-30T00:00:01.000Z" });
    if (capabilities.cancellation === "none") {
      await expect(cancellation).rejects.toMatchObject({ code: "cancellation-unsupported" });
    } else {
      expect((await cancellation).status).toBe("already-terminal");
    }
  } finally {
    await target.close();
  }
};
