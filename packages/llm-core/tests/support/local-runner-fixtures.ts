import {
  contractVersion,
  newCoreId,
  type EventId,
  type InvocationId,
  type RunId,
} from "#contracts";
import type {
  AgentRun,
  AgentRunner,
  AgentStartRequest,
  PreparedAgentDefinition,
} from "../../src/features/agent/public";
import { type InterventionAuthenticationPort } from "../../src/features/state/public";
import { decision, intervention } from "../state/resumable-checkpoint-fixtures";
import {
  createLocalAgentRunner,
  type AgentRunIdentityPort,
  type LocalAgentProgramPort,
} from "./local-agent/public";

export const IDS = [
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
export const INVOCATION_ID = newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789c01");
export const UUID_V4 = "00000000-0000-4000-8000-000000000001";

export const identityPort = (): AgentRunIdentityPort => {
  let index = 0;
  return {
    newRunId: () => newCoreId<RunId>(IDS[index++] ?? IDS.at(-1)!),
    newEventId: () => newCoreId<EventId>(IDS[index++] ?? IDS.at(-1)!),
    now: () => "2026-07-29T14:00:00.000Z",
  };
};

export const runner = (
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

export const prepare = async (
  target: AgentRunner,
  effectRequirement: "read-only" | "controlled" = "read-only",
): Promise<PreparedAgentDefinition> =>
  target.prepare({
    agentId: "test-agent",
    version: contractVersion("2.0.0"),
    instructions: "Complete the request.",
    effectRequirement,
  });

export const request = (
  agent: PreparedAgentDefinition,
  input: AgentStartRequest["input"],
): AgentStartRequest => ({
  agent,
  invocationContext: { invocationId: INVOCATION_ID },
  input,
});

export const collect = async (run: AgentRun) => {
  const events = [];
  for await (const event of run.events()) {
    events.push(event);
  }
  return events;
};

export const basicProgram = (): LocalAgentProgramPort => ({
  execute(context) {
    context.emitProgress({ code: "working" });
    return { status: "completed", output: { kind: "json", value: { ok: true } } };
  },
});

export const startInterventionRun = async (
  authentication: InterventionAuthenticationPort,
  now: () => string = () => "2026-07-29T14:00:00.000Z",
) => {
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
    { identity: { ...identityPort(), now }, interventions: { authentication } },
  );
  const run = await target.start(request(await prepare(target), null));
  const base = decision("approve");
  const bound = {
    ...base,
    decidedAt: "2026-07-29T14:00:00.000Z",
    intervention: { ...base.intervention, runId: run.identity.runId },
  };
  return { bound, observed: () => observed, release, run };
};
