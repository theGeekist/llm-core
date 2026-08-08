import { describe, expect, it } from "bun:test";
import { type ApprovalDecision } from "../../../src/features/control/public";
import type { EventSink } from "../../../src/features/evidence/public";
import {
  type ToolCall,
  type ToolDefinition,
  actionDigest,
  createExecutableTool,
  executeControlledTool,
} from "../../../src/tools/runtime";
import {
  type EvidenceId,
  type PrincipalId,
  type ResourceId,
  contractVersion,
  coreId,
  digest,
  externalId,
} from "#contracts";
import {
  CALL_ID,
  KEY_REF,
  REPLAY_CALL_ID,
  REPLAY_RUN_ID,
  REPLAY_STEP_ID,
  RUN_ID,
  SPEC,
  STEP_ID,
  baseInput,
  call,
  facts,
  id,
  MemoryJournal,
} from "./execute-fixtures";

describe("controlled tool execution", () => {
  it("persists authorization and started state before exclusive execution", async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    const events: unknown[] = [];
    const eventSink: EventSink = {
      emit: (event) => {
        events.push(event);
        return Promise.resolve();
      },
    };
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded", content: [] };
    });
    let acquiredMode: string | undefined;
    const gate = {
      acquire: async (request: Parameters<typeof input.concurrency.acquire>[0]) => {
        acquiredMode = request.mode;
        return { request, release: () => undefined };
      },
    };

    const outcome = await executeControlledTool({ ...input, concurrency: gate, eventSink });

    expect(outcome.status).toBe("succeeded");
    expect(executions).toBe(1);
    expect(acquiredMode).toBe("exclusive");
    expect("receipt" in outcome && outcome.receipt.state).toBe("succeeded");
    expect("receipt" in outcome && outcome.receipt.history.map(({ to }) => to)).toEqual([
      "awaiting_policy",
      "ready",
      "ready",
      "started",
      "succeeded",
    ]);
    expect(JSON.stringify(events)).not.toContain('"amount"');
    expect(JSON.stringify(events)).not.toContain("billing-api");
  });

  it("passes exact action facts to policy without exposing them to events", async () => {
    const journal = new MemoryJournal();
    const input = baseInput(journal, () => ({
      toolCallId: CALL_ID,
      status: "succeeded",
      content: [],
    }));
    let observedFacts: unknown;
    input.policy = {
      evaluate: ({ evaluation, facts }) => {
        observedFacts = facts;
        return {
          evaluation,
          policyId: "example.tool-policy",
          policyVersion: contractVersion("1.0.0"),
          decidedAt: "2026-07-29T00:00:00.000Z",
          decision: "allow",
        };
      },
    };

    await executeControlledTool(input);

    expect(observedFacts).toContainEqual({ name: "effect.class", value: "external-write" });
    expect(observedFacts).toContainEqual({ name: "action.arguments", value: { amount: 100 } });
  });

  it("uses the canonical policy lifecycle for read-only calls without a policy port", async () => {
    const journal = new MemoryJournal();
    const readOnlySpec: ToolDefinition = {
      ...SPEC,
      effect: { class: "read-only", targets: [] },
      execution: {
        ...SPEC.execution,
        concurrency: "shared",
        idempotency: "not-supported",
      },
    };
    const input = baseInput(journal, () => ({
      toolCallId: CALL_ID,
      status: "succeeded",
      content: [],
    }));
    const outcome = await executeControlledTool({
      ...input,
      tool: createExecutableTool({
        definition: readOnlySpec,
        argumentValidator: { validate: () => ({ valid: true }) },
        execute: input.tool.execute,
      }),
      policy: undefined,
    });

    expect(outcome.status).toBe("succeeded");
    expect("receipt" in outcome && outcome.receipt.history.map(({ to }) => to)).toEqual([
      "awaiting_policy",
      "ready",
      "ready",
      "started",
      "succeeded",
    ]);
  });

  it("rejects an approval for a changed action digest", async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded", content: [] };
    });
    input.policy = {
      evaluate: ({ evaluation }) => ({
        evaluation,
        policyId: "example.tool-policy",
        policyVersion: contractVersion("1.0.0"),
        decidedAt: "2026-07-29T00:00:00.000Z",
        decision: "require-approval",
      }),
    };
    const authenticationEvidence = {
      evidenceId: coreId<EvidenceId>(id(80)),
      kind: "other",
      content: {
        resourceId: coreId<ResourceId>(id(81)),
        mediaType: "application/json",
        byteLength: 2,
        digest: digest("b".repeat(64)),
      },
    } as const;

    const outcome = await executeControlledTool({
      ...input,
      approval: {
        expiresAt: "2026-07-29T00:01:00.000Z",
        authenticator: {
          verify: (decision) => ({ status: "authenticated", principal: decision.actor }),
        },
        request: (request) =>
          Promise.resolve({
            approval: {
              ...request.approval,
              actionDigest: actionDigest("B".repeat(43), KEY_REF),
            },
            decision: "approve",
            decidedAt: request.requestedAt,
            actor: { principalId: externalId<PrincipalId>("user:42") },
            authentication: { scheme: "test", evidence: authenticationEvidence },
          } satisfies ApprovalDecision),
      },
    });

    expect(outcome.status).toBe("denied");
    expect(executions).toBe(0);
    expect("receipt" in outcome && outcome.receipt.state).toBe("denied");
  });

  it("expires approval while waiting for the exclusive lease", async () => {
    const journal = new MemoryJournal();
    let now = "2026-07-29T00:00:00.000Z";
    let executions = 0;
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded", content: [] };
    });
    input.policy = {
      evaluate: ({ evaluation }) => ({
        evaluation,
        policyId: "example.tool-policy",
        policyVersion: contractVersion("1.0.0"),
        decidedAt: now,
        decision: "require-approval",
      }),
    };
    const evidence = {
      evidenceId: coreId<EvidenceId>(id(82)),
      kind: "other",
      content: {
        resourceId: coreId<ResourceId>(id(83)),
        mediaType: "application/json",
        byteLength: 2,
        digest: digest("c".repeat(64)),
      },
    } as const;

    const outcome = await executeControlledTool({
      ...input,
      facts: { ...facts(), now: () => now },
      approval: {
        expiresAt: "2026-07-29T00:01:00.000Z",
        authenticator: {
          verify: (decision) => ({ status: "authenticated", principal: decision.actor }),
        },
        request: (request) =>
          Promise.resolve({
            approval: request.approval,
            decision: "approve",
            decidedAt: request.requestedAt,
            actor: { principalId: externalId<PrincipalId>("user:42") },
            authentication: { scheme: "test", evidence },
          }),
      },
      concurrency: {
        acquire: async (request) => {
          now = "2026-07-29T00:02:00.000Z";
          return { request, release: () => undefined };
        },
      },
    });

    expect(outcome.status).toBe("denied");
    expect("receipt" in outcome && outcome.receipt.state).toBe("expired");
    expect(
      "receipt" in outcome &&
        outcome.receipt.history.find(({ to }) => to === "ready")?.authorizedEvidence,
    ).toEqual(evidence);
    expect(executions).toBe(0);
  });

  it("keeps a durable approval window across pending replay", async () => {
    const journal = new MemoryJournal();
    let now = "2026-07-29T00:00:00.000Z";
    let requests = 0;
    const input = baseInput(journal, () => ({
      toolCallId: CALL_ID,
      status: "succeeded",
      content: [],
    }));
    input.policy = {
      evaluate: ({ evaluation }) => ({
        evaluation,
        policyId: "example.tool-policy",
        policyVersion: contractVersion("1.0.0"),
        decidedAt: now,
        decision: "require-approval",
      }),
    };
    const approval = {
      expiresAt: "2026-07-29T00:01:00.000Z",
      authenticator: {
        verify: () => ({ status: "rejected" as const }),
      },
      request: () => {
        requests += 1;
        return Promise.resolve(null);
      },
    };

    const pending = await executeControlledTool({
      ...input,
      facts: { ...facts(), now: () => now },
      approval,
    });
    now = "2026-07-29T00:02:00.000Z";
    const expired = await executeControlledTool({
      ...input,
      facts: { ...facts(), now: () => now },
      approval,
    });

    expect(pending.status).toBe("awaiting-approval");
    expect("receipt" in pending && pending.receipt.approvalRequestedAt).toBe(
      "2026-07-29T00:00:00.000Z",
    );
    expect(expired.status).toBe("denied");
    expect("receipt" in expired && expired.receipt.state).toBe("expired");
    expect(requests).toBe(1);
  });

  it("returns existing for the same action and conflicts on changed arguments", async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    const firstInput = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded", content: [] };
    });

    const first = await executeControlledTool(firstInput);
    const replay = await executeControlledTool({ ...firstInput, facts: facts() });
    const changed = await executeControlledTool({
      ...firstInput,
      call: call(101),
      facts: facts(),
    });

    expect(first.status).toBe("succeeded");
    expect(replay.status).toBe("existing");
    expect(changed.status).toBe("conflict");
    expect(executions).toBe(1);
  });

  it("returns the original receipt for an idempotent replay from another run and call", async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded", content: [] };
    });

    const first = await executeControlledTool(input);
    const replay = await executeControlledTool({
      ...input,
      call: {
        ...input.call,
        toolCallId: REPLAY_CALL_ID,
        invocation: {
          ...input.call.invocation,
          runId: REPLAY_RUN_ID,
        },
      },
      facts: facts(),
    });

    expect(first.status).toBe("succeeded");
    expect(replay.status).toBe("existing");
    expect("receipt" in replay && replay.receipt.runId).toBe(RUN_ID);
    expect("receipt" in replay && replay.receipt.toolCallId).toBe(CALL_ID);
    expect(executions).toBe(1);
  });

  it("continues a pending replay under the original receipt identity", async () => {
    const journal = new MemoryJournal();
    let executedCall: ToolCall | undefined;
    let validations = 0;
    const base = baseInput(journal, ({ call: boundCall }) => {
      executedCall = boundCall;
      return { toolCallId: boundCall.toolCallId, status: "succeeded", content: [] };
    });
    const input = {
      ...base,
      tool: createExecutableTool({
        definition: SPEC,
        argumentValidator: {
          validate: () => {
            validations += 1;
            if (validations > 2) {
              throw new Error("validator must not be re-entered after replay admission");
            }
            return { valid: true };
          },
        },
        execute: base.tool.execute,
      }),
    };
    input.call = {
      ...input.call,
      invocation: { ...input.call.invocation, stepId: STEP_ID },
    };
    input.policy = {
      evaluate: ({ evaluation }) => ({
        evaluation,
        policyId: "example.tool-policy",
        policyVersion: contractVersion("1.0.0"),
        decidedAt: "2026-07-29T00:00:00.000Z",
        decision: "require-approval",
      }),
    };
    const evidence = {
      evidenceId: coreId<EvidenceId>(id(84)),
      kind: "other",
      content: {
        resourceId: coreId<ResourceId>(id(85)),
        mediaType: "application/json",
        byteLength: 2,
        digest: digest("d".repeat(64)),
      },
    } as const;
    const approval = {
      expiresAt: "2026-07-29T00:01:00.000Z",
      authenticator: {
        verify: (decision: ApprovalDecision) => ({
          status: "authenticated" as const,
          principal: decision.actor,
        }),
      },
      request: () => Promise.resolve(null),
    };

    const pending = await executeControlledTool({ ...input, approval });
    const replay = await executeControlledTool({
      ...input,
      call: {
        ...input.call,
        toolCallId: REPLAY_CALL_ID,
        invocation: {
          ...input.call.invocation,
          runId: REPLAY_RUN_ID,
          stepId: REPLAY_STEP_ID,
        },
      },
      approval: {
        ...approval,
        request: (request) =>
          Promise.resolve({
            approval: request.approval,
            decision: "approve",
            decidedAt: request.requestedAt,
            actor: { principalId: externalId<PrincipalId>("user:42") },
            authentication: { scheme: "test", evidence },
          } satisfies ApprovalDecision),
      },
      facts: facts(),
    });

    expect(pending.status).toBe("awaiting-approval");
    expect(replay.status).toBe("succeeded");
    expect(executedCall?.toolCallId).toBe(CALL_ID);
    expect(executedCall?.invocation.runId).toBe(RUN_ID);
    expect(executedCall?.invocation.stepId).toBe(STEP_ID);
    expect("receipt" in replay && replay.receipt.stepId).toBe(STEP_ID);
    expect(validations).toBe(2);
  });
});
