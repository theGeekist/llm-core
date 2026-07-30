import { describe, expect, test } from "bun:test";
import type { JsonValue } from "#contracts";
import {
  actionDigestInput,
  type ActionDigestPort,
  type BoundAction,
} from "../../../src/features/tooling/public";
import {
  createInterventionRequest,
  interventionId,
  interventionDecisionId,
  registerResumableCheckpoint,
  type InterventionDecision,
  type InterventionRequest,
  type RegisteredResumableCheckpoint,
} from "../../../src/features/state/public";
import {
  resumeInterventionWorkflow,
  type MeaningfulWorkflowStep,
  type ResumableWorkflowStep,
  type WorkflowCheckpointClaim,
  type WorkflowCheckpointCommit,
  type WorkflowDecisionToken,
  type WorkflowResumeJournal,
} from "../../../src/application/workflow/public";
import {
  ACTION_DIGEST,
  COMPATIBILITY,
  LATER,
  STEP_ONE,
  STEP_TWO,
  checkpoint,
  decision,
  intervention,
  principal,
  receipt,
} from "../../state/helpers";

const ACTION_DOCUMENT = {
  contractProfile: "llm-core.action/v1",
  tool: {
    id: "test.safe-action",
    version: "1.0.0",
    inputSchemaDigest: { algorithm: "sha-256", value: "a".repeat(64) },
  },
  effect: { class: "external-write", targets: [{ kind: "service", id: "test-service" }] },
  authority: {},
  execution: {
    concurrency: "exclusive",
    cancellation: "provider-acknowledged",
    idempotency: "required",
    retryAfterStart: "never",
  },
  arguments: { safe: true },
} as unknown as BoundAction["document"];

const ACTION: BoundAction = {
  document: ACTION_DOCUMENT,
  canonicalDocument: actionDigestInput(ACTION_DOCUMENT),
  digest: ACTION_DIGEST,
};

class MemoryResumeJournal implements WorkflowResumeJournal {
  checkpointState: "available" | "claimed" | "consumed" = "available";
  decisionIds = new Set<string>();
  interventionIds = new Set<string>();
  events: string[] = [];
  quarantined: string[] = [];
  decisions: string[] = [];
  commit: WorkflowCheckpointCommit | null = null;
  persistDecision = true;
  persistEffect = true;
  persistCheckpoint = true;

  begin(input: Parameters<WorkflowResumeJournal["begin"]>[0]) {
    if (this.decisionIds.has(input.decisionId)) {
      return { status: "decision-already-consumed" as const };
    }
    if (input.claimCheckpoint && this.checkpointState === "claimed") {
      return { status: "checkpoint-already-claimed" as const };
    }
    if (input.claimCheckpoint && this.checkpointState === "consumed") {
      return { status: "checkpoint-already-consumed" as const };
    }
    if (this.interventionIds.has(input.interventionId)) {
      return { status: "intervention-already-resolved" as const };
    }
    this.decisionIds.add(input.decisionId);
    this.interventionIds.add(input.interventionId);
    const decisionToken = {
      decisionToken: `decision:${input.decisionId}`,
      decisionId: input.decisionId,
      interventionId: input.interventionId,
    };
    if (!input.claimCheckpoint) {
      return { status: "accepted" as const, decision: decisionToken };
    }
    this.checkpointState = "claimed";
    return {
      status: "accepted" as const,
      decision: decisionToken,
      checkpoint: {
        claimToken: `claim:${input.checkpointId}:${input.checkpointRevision}`,
        checkpointId: input.checkpointId,
        checkpointRevision: input.checkpointRevision,
      },
    };
  }

  completeDecision(input: { decision: WorkflowDecisionToken; outcome: string }) {
    this.events.push(`decision:${input.outcome}`);
    if (this.persistDecision) {
      this.decisions.push(input.outcome);
    }
    return this.persistDecision;
  }

  recordEffectStarted(input: {
    claim: WorkflowCheckpointClaim;
    stepId: typeof STEP_ONE;
    actionDigest: typeof ACTION_DIGEST;
  }) {
    this.events.push("effect:started");
    return {
      durable: "acknowledged" as const,
      effect: receipt(input.stepId, "started"),
    };
  }

  recordEffectCompleted(_input: Parameters<WorkflowResumeJournal["recordEffectCompleted"]>[0]) {
    this.events.push("effect:completed");
    return this.persistEffect;
  }

  completeCheckpoint(input: {
    decision: WorkflowDecisionToken;
    claim: WorkflowCheckpointClaim;
    commit: WorkflowCheckpointCommit;
  }) {
    this.events.push(`checkpoint:${input.commit.disposition}`);
    if (!this.persistCheckpoint) {
      return false;
    }
    this.checkpointState = "consumed";
    this.commit = input.commit;
    return true;
  }

  quarantine(input: Parameters<WorkflowResumeJournal["quarantine"]>[0]) {
    this.quarantined.push(input.reason);
  }
}

const passiveStep = (
  execute: (state: JsonValue) => JsonValue = (state) => state,
): ResumableWorkflowStep => ({
  stepId: STEP_TWO,
  effect: "none",
  execute: (state) => ({ state: execute(state) }),
});

const meaningfulStep = (
  execute: MeaningfulWorkflowStep["execute"] = ({ started }) => ({
    state: { applied: true },
    recordedEffect: { ...started, status: "completed" },
  }),
): MeaningfulWorkflowStep => ({
  stepId: STEP_ONE,
  effect: "meaningful",
  action: ACTION,
  execute,
});

const digestPort = (verified = true): ActionDigestPort => ({
  create: () => ACTION_DIGEST,
  verify: () => verified,
});

const run = (input: {
  registered?: RegisteredResumableCheckpoint;
  journal?: MemoryResumeJournal;
  choice?: InterventionDecision;
  request?: InterventionRequest;
  steps?: readonly ResumableWorkflowStep[];
  digestVerified?: boolean;
  authenticated?: boolean;
  clockThrows?: boolean;
}) =>
  resumeInterventionWorkflow({
    checkpoint: input.registered ?? registerResumableCheckpoint(checkpoint()),
    intervention: input.request ?? intervention(),
    decision: input.choice ?? decision("approve"),
    expectedCompatibility: COMPATIBILITY,
    securityDomain: "tenant:test",
    actionDigestPort: digestPort(input.digestVerified),
    authentication: {
      verify: () =>
        input.authenticated === false
          ? { status: "rejected" as const }
          : { status: "authenticated" as const, principal },
    },
    clock: {
      now: () => {
        if (input.clockThrows) {
          throw new Error("clock unavailable");
        }
        return LATER;
      },
    },
    journal: input.journal ?? new MemoryResumeJournal(),
    steps: input.steps ?? [meaningfulStep()],
  });

const nextIntervention = (): InterventionRequest => {
  const current = intervention();
  return createInterventionRequest({
    ...current,
    intervention: {
      ...current.intervention,
      interventionId: interventionId("018f0f4e-8c5b-7a91-8c3b-123456789a11"),
    },
  });
};

const nextDecision = (request = intervention()): InterventionDecision => ({
  ...decision("approve"),
  decisionId: interventionDecisionId("018f0f4e-8c5b-7a91-8c3b-123456789a10"),
  intervention: request.intervention,
});

describe("intervention workflow resume", () => {
  test("authenticates and cryptographically verifies the exact bound action before execution", async () => {
    const journal = new MemoryResumeJournal();
    let executions = 0;
    expect(
      await run({
        journal,
        authenticated: false,
        steps: [
          meaningfulStep(() => {
            executions += 1;
            throw new Error("not authorized");
          }),
        ],
      }),
    ).toEqual({ status: "rejected", reason: "authentication-failed" });
    expect(journal.events).toEqual([]);
    expect(executions).toBe(0);

    expect(await run({ journal: new MemoryResumeJournal(), digestVerified: false })).toEqual({
      status: "rejected",
      reason: "action-verification-failed",
    });
  });

  test("rejects a bound action whose document differs from its authenticated canonical bytes", async () => {
    const step = meaningfulStep();
    const outcome = await run({
      steps: [
        {
          ...step,
          action: {
            ...ACTION,
            document: { ...ACTION.document, arguments: { safe: false } },
          },
        },
      ],
    });
    expect(outcome).toEqual({ status: "rejected", reason: "action-verification-failed" });
  });

  test("fails closed when the trusted clock is unavailable", async () => {
    const journal = new MemoryResumeJournal();
    expect(await run({ journal, clockThrows: true })).toEqual({
      status: "rejected",
      reason: "intervention-rejected",
    });
    expect(journal.events).toEqual([]);
  });

  test("records durable started before invocation and durable completion before checkpoint commit", async () => {
    const journal = new MemoryResumeJournal();
    const outcome = await run({
      journal,
      steps: [
        meaningfulStep(({ action, started }) => {
          journal.events.push("effect:invoke");
          expect(action).toBe(ACTION);
          expect(started.status).toBe("started");
          return {
            state: { applied: true },
            recordedEffect: { ...started, status: "completed" },
          };
        }),
      ],
    });
    expect(outcome.status).toBe("completed");
    expect(journal.events).toEqual([
      "effect:started",
      "effect:invoke",
      "effect:completed",
      "checkpoint:completed",
    ]);
    expect(journal.commit?.state).toEqual({ applied: true });
  });

  test("skips completed meaningful effects and executes only remaining passive steps", async () => {
    let effectExecutions = 0;
    let passiveExecutions = 0;
    const outcome = await run({
      registered: registerResumableCheckpoint(
        checkpoint({
          completedStepIds: [STEP_ONE],
          recordedEffects: [receipt(STEP_ONE, "completed")],
          state: { count: 1 },
        }),
      ),
      steps: [
        meaningfulStep(() => {
          effectExecutions += 1;
          throw new Error("must not replay");
        }),
        passiveStep(() => {
          passiveExecutions += 1;
          return { count: 2 };
        }),
      ],
    });
    expect(outcome.status).toBe("completed");
    expect(effectExecutions).toBe(0);
    expect(passiveExecutions).toBe(1);
  });

  for (const status of ["started", "indeterminate"] as const) {
    test(`never replays an effect recorded as ${status}`, async () => {
      let executions = 0;
      const journal = new MemoryResumeJournal();
      const outcome = await run({
        journal,
        registered: registerResumableCheckpoint(
          checkpoint({ recordedEffects: [receipt(STEP_ONE, status)] }),
        ),
        steps: [
          meaningfulStep(() => {
            executions += 1;
            return { state: {}, recordedEffect: receipt(STEP_ONE, "completed") };
          }),
        ],
      });
      expect(outcome).toEqual({
        status: "reconciliation-required",
        stepId: STEP_ONE,
        effectStatus: status,
      });
      expect(executions).toBe(0);
      expect(journal.quarantined).toEqual(["effect-state-unsafe"]);
    });
  }

  test("a failed durable effect completion leaves the checkpoint claimed and unreplayable", async () => {
    const journal = new MemoryResumeJournal();
    journal.persistEffect = false;
    let executions = 0;
    const outcome = await run({
      journal,
      steps: [
        meaningfulStep(({ started }) => {
          executions += 1;
          return { state: {}, recordedEffect: { ...started, status: "completed" } };
        }),
      ],
    });
    expect(outcome.status).toBe("failed");
    expect(executions).toBe(1);
    expect(journal.checkpointState).toBe("claimed");
    expect(await run({ journal, choice: nextDecision() })).toEqual({
      status: "rejected",
      reason: "checkpoint-already-claimed",
    });
  });

  test("retained decisions consume only the decision and allow a newly bound follow-up", async () => {
    const journal = new MemoryResumeJournal();
    expect((await run({ journal, choice: decision("defer") })).status).toBe("deferred");
    expect(journal.checkpointState).toBe("available");
    expect(await run({ journal, choice: decision("defer") })).toEqual({
      status: "rejected",
      reason: "decision-already-consumed",
    });
    expect(await run({ journal, choice: nextDecision() })).toEqual({
      status: "rejected",
      reason: "intervention-already-resolved",
    });
    const request = nextIntervention();
    expect((await run({ journal, request, choice: nextDecision(request) })).status).toBe(
      "completed",
    );
  });

  test("validates compatibility before authentication, claim or execution", async () => {
    const journal = new MemoryResumeJournal();
    const outcome = await resumeInterventionWorkflow({
      checkpoint: registerResumableCheckpoint(checkpoint()),
      intervention: intervention(),
      decision: decision("approve"),
      expectedCompatibility: {
        ...COMPATIBILITY,
        runtime: { ...COMPATIBILITY.runtime, runtimeId: "wrong.runtime" },
      },
      securityDomain: "tenant:test",
      actionDigestPort: digestPort(),
      authentication: { verify: () => ({ status: "authenticated", principal }) },
      clock: { now: () => LATER },
      journal,
      steps: [meaningfulStep()],
    });
    expect(outcome).toEqual({ status: "incompatible", reason: "runtime-id-mismatch" });
    expect(journal.events).toEqual([]);
  });

  test("rejects unregistered checkpoint-shaped input", async () => {
    const outcome = await resumeInterventionWorkflow({
      checkpoint: checkpoint() as RegisteredResumableCheckpoint,
      intervention: intervention(),
      decision: decision("approve"),
      expectedCompatibility: COMPATIBILITY,
      securityDomain: "tenant:test",
      actionDigestPort: digestPort(),
      authentication: { verify: () => ({ status: "authenticated", principal }) },
      clock: { now: () => LATER },
      journal: new MemoryResumeJournal(),
      steps: [meaningfulStep()],
    });
    expect(outcome).toEqual({ status: "rejected", reason: "checkpoint-not-registered" });
  });

  test("keeps all six workflow dispositions distinct", async () => {
    const expected = {
      approve: "completed",
      deny: "denied",
      defer: "deferred",
      edit: "edit-requires-new-binding",
      cancel: "cancelled",
      escalate: "escalated",
    } as const;
    for (const choice of Object.keys(expected) as Array<keyof typeof expected>) {
      expect((await run({ choice: decision(choice) })).status).toBe(expected[choice]);
    }
  });

  test("supports synchronous MaybePromise ports and steps", async () => {
    expect((await run({ steps: [meaningfulStep()] })).status).toBe("completed");
  });
});
