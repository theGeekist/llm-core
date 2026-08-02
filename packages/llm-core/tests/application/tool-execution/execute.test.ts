/* eslint-disable max-lines -- one scenario suite exercises the complete receipt state machine */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "bun:test";
import {
  contractVersion,
  coreId,
  digest,
  externalId,
  schemaRef,
  secretRef,
  type EventId,
  type EvidenceId,
  type InvocationId,
  type PrincipalId,
  type ResourceId,
  type RunId,
  type StepId,
  type TenantId,
  type ToolCallId,
} from "#contracts";
import { type ApprovalDecision, type PolicyDecision } from "../../../src/features/control/public";
import {
  approvalId,
  cancellationId,
  createConcurrencyGate,
  policyEvaluationId,
  type PolicyEvaluationPort,
} from "../../../src/features/control/runtime";
import {
  type AppendToolReceiptTransition,
  type AppendToolReceiptTransitionResult,
  type ClaimToolReceiptExecution,
  type ClaimToolReceiptExecutionResult,
  type EventSink,
  type LookupToolReceiptByIdempotency,
  type ReserveToolReceipt,
  type ReserveToolReceiptResult,
  type ToolExecutionReceipt,
  type ToolReceiptFence,
  type ToolReceiptJournal,
} from "../../../src/features/evidence/public";
import {
  classifyExistingReservation,
  isToolReceiptFenceActive,
  isToolReceiptTransitionAllowed,
  toolReceiptFencesEqual,
} from "../../../src/features/evidence/runtime";
import {
  actionDigest,
  createExecutableTool,
  executeControlledTool,
  registerToolSchema,
  toolId,
  type ActionDigestPort,
  type ExecutableTool,
  type ToolCall,
  type ToolDefinition,
  type ToolExecutionFactsPort,
} from "../../../src/features/tooling/runtime";
import { reconcileControlledToolReceipt } from "../../../src/application/tool-execution/public";

const RUN_ID = coreId<RunId>("018f0f4e-8c5b-7a91-8c3b-123456789001");
const CALL_ID = coreId<ToolCallId>("018f0f4e-8c5b-7a91-8c3b-123456789002");
const REPLAY_RUN_ID = coreId<RunId>("018f0f4e-8c5b-7a91-8c3b-123456789004");
const REPLAY_CALL_ID = coreId<ToolCallId>("018f0f4e-8c5b-7a91-8c3b-123456789005");
const STEP_ID = coreId<StepId>("018f0f4e-8c5b-7a91-8c3b-123456789006");
const REPLAY_STEP_ID = coreId<StepId>("018f0f4e-8c5b-7a91-8c3b-123456789007");
const UUID_V4 = "00000000-0000-4000-8000-000000000001";
const KEY_REF = secretRef("vault:tool-action/current");

const digestPort: ActionDigestPort = {
  create: ({ canonicalDocument, securityDomain, keyRef }) =>
    actionDigest(
      createHmac("sha256", "test-key")
        .update(securityDomain)
        .update("\0")
        .update(canonicalDocument)
        .digest("base64url"),
      keyRef,
    ),
  verify: () => true,
};

const INPUT_SCHEMA = await registerToolSchema(
  {
    type: "object",
    additionalProperties: false,
    required: ["amount"],
    properties: { amount: { type: "integer" } },
  },
  { digest: () => digest("a".repeat(64)) },
);

const SPEC: ToolDefinition = {
  id: toolId("billing.invoice.create"),
  version: contractVersion("1.0.0"),
  description: "Create invoice",
  inputSchema: INPUT_SCHEMA,
  effect: {
    class: "external-write",
    targets: [{ kind: "service", id: "billing-api" }],
  },
  execution: {
    concurrency: "exclusive",
    cancellation: "cooperative",
    idempotency: "required",
    retryAfterStart: "requires-conformance",
  },
};

const call = (amount = 100): ToolCall => ({
  toolCallId: CALL_ID,
  toolId: SPEC.id,
  toolVersion: SPEC.version,
  arguments: { amount },
  idempotencyKey: "invoice-42",
  invocation: {
    invocationId: coreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789003"),
    runId: RUN_ID,
    tenant: { tenantId: externalId<TenantId>("tenant:acme") },
    principal: { principalId: externalId<PrincipalId>("user:42") },
  },
});

const keyOf = (request: ReserveToolReceipt | LookupToolReceiptByIdempotency): string =>
  JSON.stringify(request.key);

class MemoryJournal implements ToolReceiptJournal {
  readonly byId = new Map<EvidenceId, ToolExecutionReceipt>();
  readonly byKey = new Map<string, EvidenceId>();
  now = "2026-07-29T00:00:00.000Z";

  async reserve(request: ReserveToolReceipt): Promise<ReserveToolReceiptResult> {
    const existingId = this.byKey.get(keyOf(request));
    if (existingId) {
      const existing = this.byId.get(existingId)!;
      return classifyExistingReservation(existing, request) === "existing"
        ? { kind: "existing", receipt: existing, durable: "acknowledged" }
        : {
            kind: "conflict",
            existingReceiptId: existing.receiptId,
            existingDigest: existing.actionDigest,
            requestedDigest: request.actionDigest,
          };
    }
    const receipt: ToolExecutionReceipt = {
      ...request,
      revision: 0,
      state: "reserved",
      effectDisposition: "not-started",
      history: [],
    };
    this.byId.set(receipt.receiptId, receipt);
    this.byKey.set(keyOf(request), receipt.receiptId);
    return { kind: "created", receipt, durable: "acknowledged" };
  }

  async append(request: AppendToolReceiptTransition): Promise<AppendToolReceiptTransitionResult> {
    const current = this.byId.get(request.receiptId);
    if (!current) {
      return { kind: "not-found", receiptId: request.receiptId };
    }
    if (current.revision !== request.expectedRevision) {
      return {
        kind: "revision-conflict",
        receipt: current,
        expectedRevision: request.expectedRevision,
        actualRevision: current.revision,
      };
    }
    if (
      current.executionFence &&
      (!request.transition.fence ||
        !toolReceiptFencesEqual(current.executionFence, request.transition.fence) ||
        !isToolReceiptFenceActive(current.executionFence, this.now))
    ) {
      return {
        kind: "fence-conflict",
        receipt: current,
        expectedFence: request.transition.fence,
        actualFence: current.executionFence,
      };
    }
    if (
      request.transition.from !== current.state ||
      !isToolReceiptTransitionAllowed(current.state, request.transition.to)
    ) {
      throw new Error("invalid transition");
    }
    const entry = {
      ...request.transition,
      revision: current.revision + 1,
      durable: "acknowledged" as const,
    };
    const receipt: ToolExecutionReceipt = {
      ...current,
      revision: entry.revision,
      state: entry.to,
      effectDisposition: entry.effectDisposition,
      policy: entry.policy ?? current.policy,
      approval: entry.approval ?? current.approval,
      cancellation: entry.cancellation ?? current.cancellation,
      approvalRequestedAt: entry.approvalRequestedAt ?? current.approvalRequestedAt,
      approvalExpiresAt: entry.approvalExpiresAt ?? current.approvalExpiresAt,
      approvalRequiredApprover: entry.approvalRequiredApprover ?? current.approvalRequiredApprover,
      executionFence: entry.fence ?? current.executionFence,
      reconciliation: entry.reconciliation ?? current.reconciliation,
      history: [...current.history, entry],
    };
    this.byId.set(receipt.receiptId, receipt);
    return { kind: "appended", receipt, entry, durable: "acknowledged" };
  }

  async claim(request: ClaimToolReceiptExecution): Promise<ClaimToolReceiptExecutionResult> {
    const current = this.byId.get(request.receiptId);
    if (!current) {
      return { kind: "not-found", receiptId: request.receiptId };
    }
    if (current.revision !== request.expectedRevision) {
      return {
        kind: "revision-conflict",
        receipt: current,
        expectedRevision: request.expectedRevision,
        actualRevision: current.revision,
      };
    }
    if (
      current.state !== "ready" &&
      current.state !== "started" &&
      current.state !== "indeterminate"
    ) {
      return { kind: "not-eligible", receipt: current };
    }
    if (current.executionFence && isToolReceiptFenceActive(current.executionFence, this.now)) {
      return { kind: "held", receipt: current, fence: current.executionFence };
    }
    const fence: ToolReceiptFence = {
      owner: request.owner,
      token: (current.executionFence?.token ?? 0) + 1,
      acquiredAt: this.now,
      expiresAt: new Date(Date.parse(this.now) + request.leaseDurationMs).toISOString(),
    };
    const entry = {
      transitionId: request.transitionId,
      from: current.state,
      to: current.state,
      recordedAt: this.now,
      effectDisposition: current.effectDisposition,
      reasonCode: "receipt-execution-claimed",
      fence,
      redaction: request.redaction,
      revision: current.revision + 1,
      durable: "acknowledged" as const,
    };
    const receipt: ToolExecutionReceipt = {
      ...current,
      revision: entry.revision,
      executionFence: fence,
      history: [...current.history, entry],
    };
    this.byId.set(receipt.receiptId, receipt);
    return { kind: "claimed", receipt, fence, entry, durable: "acknowledged" };
  }

  async verifyFence({ receiptId, fence }: { receiptId: EvidenceId; fence: ToolReceiptFence }) {
    const receipt = this.byId.get(receiptId) ?? null;
    return receipt &&
      receipt.executionFence &&
      toolReceiptFencesEqual(receipt.executionFence, fence) &&
      isToolReceiptFenceActive(receipt.executionFence, this.now)
      ? { kind: "active" as const, receipt }
      : { kind: "inactive" as const, receipt };
  }

  async load({ receiptId }: { receiptId: EvidenceId }): Promise<ToolExecutionReceipt | null> {
    return this.byId.get(receiptId) ?? null;
  }

  async loadByIdempotency(
    request: LookupToolReceiptByIdempotency,
  ): Promise<ToolExecutionReceipt | null> {
    const receiptId = this.byKey.get(keyOf(request));
    return receiptId ? (this.byId.get(receiptId) ?? null) : null;
  }
}

const id = (ordinal: number): string =>
  `018f0f4e-8c5b-7a91-8c3b-${String(123456780000 + ordinal).padStart(12, "0")}`;

const facts = (): ToolExecutionFactsPort => {
  let ordinal = 10;
  const next = (): string => id(ordinal++);
  return {
    now: () => "2026-07-29T00:00:00.000Z",
    newReceiptId: () => coreId<EvidenceId>(next()),
    newEventId: () => coreId<EventId>(next()),
    newPolicyEvaluationId: () => policyEvaluationId(next()),
    newApprovalId: () => approvalId(next()),
    newCancellationId: () => cancellationId(next()),
  };
};

const allowPolicy = {
  evaluate: ({
    evaluation,
  }: Parameters<
    NonNullable<Parameters<typeof executeControlledTool>[0]["policy"]>["evaluate"]
  >[0]) =>
    ({
      evaluation,
      policyId: "example.tool-policy",
      policyVersion: contractVersion("1.0.0"),
      decidedAt: "2026-07-29T00:00:00.000Z",
      decision: "allow",
    }) satisfies PolicyDecision,
};

const baseInput = (
  journal: ToolReceiptJournal,
  execute: NonNullable<Parameters<typeof createExecutableTool>[0]["execute"]>,
) => ({
  tool: createExecutableTool({
    definition: SPEC,
    argumentValidator: { validate: () => ({ valid: true }) },
    execute,
  }),
  call: call(),
  securityDomain: "tenant:acme",
  digestKeyRef: KEY_REF,
  digestPort,
  policy: allowPolicy as PolicyEvaluationPort,
  journal,
  receiptOwner: { ownerId: "worker:one" },
  receiptLeaseDurationMs: 60_000,
  concurrency: createConcurrencyGate(),
  facts: facts(),
});

describe("controlled tool execution", () => {
  it("rejects an unregistered compiled authority before reserving or invoking a tool", async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded" as const, content: [] };
    });

    await expect(
      executeControlledTool({
        ...input,
        specification: { compiled: {} as never, authority: {} as never },
      }),
    ).rejects.toThrow("registered compiled specification");
    expect(executions).toBe(0);
    expect(journal.byId.size).toBe(0);
  });

  it("rejects shaped and cloned ExecutableTool forgeries before controlled side effects", async () => {
    const journal = new MemoryJournal();
    let validations = 0;
    let executions = 0;
    let identityMints = 0;
    let policyEvaluations = 0;
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded" as const, content: [] };
    });
    const validate = input.tool.validate;
    const forged = {
      ...input.tool,
      validate: (validationInput: Parameters<ExecutableTool["validate"]>[0]) => {
        validations += 1;
        return validate(validationInput);
      },
    } as ExecutableTool;
    const guardedInput = {
      ...input,
      tool: forged,
      facts: {
        ...input.facts,
        newReceiptId: () => {
          identityMints += 1;
          return input.facts.newReceiptId();
        },
      },
      policy: {
        evaluate: (request: Parameters<PolicyEvaluationPort["evaluate"]>[0]) => {
          policyEvaluations += 1;
          return allowPolicy.evaluate(request);
        },
      },
    };

    await expect(executeControlledTool(guardedInput)).rejects.toThrow(
      "Controlled tool execution requires a registered ExecutableTool.",
    );
    expect(validations).toBe(0);
    expect(executions).toBe(0);
    expect(identityMints).toBe(0);
    expect(policyEvaluations).toBe(0);
    expect(journal.byId.size).toBe(0);
  });

  it("rejects UUIDv4 values from receipt, event, and policy identity ports", async () => {
    const execute = () => ({ toolCallId: CALL_ID, status: "succeeded" as const, content: [] });

    for (const [factory, label] of [
      ["newReceiptId", "Tool receipt"],
      ["newEventId", "Tool execution event"],
      ["newPolicyEvaluationId", "Tool policy evaluation"],
    ] as const) {
      const input = baseInput(new MemoryJournal(), execute);
      input.facts = {
        ...input.facts,
        [factory]: () => UUID_V4 as never,
      };
      await expect(executeControlledTool(input)).rejects.toThrow(
        `${label} identity ports must mint canonical UUIDv7 IDs`,
      );
    }
  });

  it("rejects UUIDv4 values from approval and cancellation identity ports", async () => {
    const approvalInput = baseInput(new MemoryJournal(), () => ({
      toolCallId: CALL_ID,
      status: "succeeded",
      content: [],
    }));
    approvalInput.facts = {
      ...approvalInput.facts,
      newApprovalId: () => UUID_V4 as never,
    };
    approvalInput.policy = {
      evaluate: ({ evaluation }) => ({
        evaluation,
        policyId: "example.tool-policy",
        policyVersion: contractVersion("1.0.0"),
        decidedAt: "2026-07-29T00:00:00.000Z",
        decision: "require-approval",
      }),
    };
    await expect(executeControlledTool(approvalInput)).rejects.toThrow(
      "Tool approval identity ports must mint canonical UUIDv7 IDs",
    );

    const cancellationInput = baseInput(new MemoryJournal(), () => ({
      toolCallId: CALL_ID,
      status: "succeeded",
      content: [],
    }));
    cancellationInput.facts = {
      ...cancellationInput.facts,
      newCancellationId: () => UUID_V4 as never,
    };
    await expect(
      executeControlledTool({
        ...cancellationInput,
        executionControl: {
          isCancellationRequested: () => true,
          onCancellationRequested: () => () => undefined,
        },
      }),
    ).rejects.toThrow("Tool cancellation identity ports must mint canonical UUIDv7 IDs");
  });

  it("validates arguments before reserving or authorizing an action", async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded", content: [] };
    });
    const binding = createExecutableTool({
      definition: SPEC,
      argumentValidator: {
        validate: () => ({
          valid: false,
          issues: [{ path: "/amount", code: "not-an-integer" }],
        }),
      },
      execute: input.tool.execute,
    });

    await expect(executeControlledTool({ ...input, tool: binding })).rejects.toThrow(
      "Tool arguments do not satisfy the registered input schema.",
    );
    expect(journal.byId.size).toBe(0);
    expect(executions).toBe(0);
  });

  it("validates exactly once and executes the immutable call bound into the action digest", async () => {
    const journal = new MemoryJournal();
    const originalCall = call();
    let validations = 0;
    let executedCall: ToolCall | undefined;
    let canonicalDocument: string | undefined;
    const binding = createExecutableTool({
      definition: SPEC,
      argumentValidator: {
        validate: () => {
          validations += 1;
          return validations === 1
            ? { valid: true }
            : {
                valid: false,
                issues: [{ path: "", code: "validator-reentered" }],
              };
        },
      },
      execute: ({ call: validatedCall }) => {
        executedCall = validatedCall;
        return { toolCallId: validatedCall.toolCallId, status: "succeeded", content: [] };
      },
    });
    const capturingDigestPort: ActionDigestPort = {
      create: (material) => {
        canonicalDocument = material.canonicalDocument;
        return digestPort.create(material);
      },
      verify: digestPort.verify,
    };
    const input = {
      ...baseInput(journal, () => ({
        toolCallId: CALL_ID,
        status: "succeeded" as const,
        content: [],
      })),
      tool: binding,
      call: originalCall,
      digestPort: capturingDigestPort,
      concurrency: {
        acquire: async (
          request: Parameters<ReturnType<typeof baseInput>["concurrency"]["acquire"]>[0],
        ) => {
          (originalCall.arguments as { amount: number }).amount = 999;
          originalCall.invocation.tenant!.tenantId = externalId<TenantId>("tenant:mutated");
          return { request, release: () => undefined };
        },
      },
    };

    const outcome = await executeControlledTool(input);

    expect(outcome.status).toBe("succeeded");
    expect(validations).toBe(1);
    expect(executedCall?.arguments).toEqual({ amount: 100 });
    expect(executedCall?.invocation.tenant?.tenantId).toBe(externalId<TenantId>("tenant:acme"));
    expect(Object.isFrozen(executedCall)).toBe(true);
    expect(Object.isFrozen(executedCall?.arguments)).toBe(true);
    expect(Object.isFrozen(executedCall?.invocation)).toBe(true);
    expect(JSON.parse(canonicalDocument!).arguments).toEqual({ amount: 100 });
  });

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

  it("records cancellation before start without invoking the binding", async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded", content: [] };
    });

    const outcome = await executeControlledTool({
      ...input,
      executionControl: {
        isCancellationRequested: () => true,
        onCancellationRequested: () => () => undefined,
      },
    });

    expect(outcome.status).toBe("cancelled");
    expect(executions).toBe(0);
    expect("receipt" in outcome && outcome.receipt.state).toBe("cancelled_before_start");
  });

  it("fails closed on a mismatched concurrency lease", async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    let released = false;
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded", content: [] };
    });

    await expect(
      executeControlledTool({
        ...input,
        concurrency: {
          acquire: (request) =>
            Promise.resolve({
              request: { ...request, mode: "shared" },
              release: () => {
                released = true;
              },
            }),
        },
      }),
    ).rejects.toThrow("Concurrency gate returned a mismatched lease.");
    expect(executions).toBe(0);
    expect(released).toBe(true);
  });

  it("records post-start cancellation without treating the request as proof of no effect", async () => {
    const journal = new MemoryJournal();
    let requested = false;
    const handlers = new Set<() => void>();
    const control = {
      isCancellationRequested: () => requested,
      onCancellationRequested: (handler: () => void) => {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
    };
    const input = baseInput(journal, () => {
      requested = true;
      handlers.forEach((handler) => handler());
      return { toolCallId: CALL_ID, status: "succeeded", content: [] };
    });

    const outcome = await executeControlledTool({
      ...input,
      executionControl: control,
    });

    expect(outcome.status).toBe("succeeded");
    expect("receipt" in outcome && outcome.receipt.effectDisposition).toBe("applied");
    expect("receipt" in outcome && outcome.receipt.cancellation).toMatchObject({
      runId: RUN_ID,
      toolCallId: CALL_ID,
    });
    expect("receipt" in outcome && outcome.receipt.history.at(-1)?.reasonCode).toBe(
      "cancellation-requested-effect-completed",
    );
    expect(
      "receipt" in outcome &&
        outcome.receipt.history.some(
          ({ from, to, reasonCode }) =>
            from === "started" &&
            to === "started" &&
            reasonCode === "cancellation-requested-after-start",
        ),
    ).toBe(true);
  });

  it("does not let a pending event sink gate execution", async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded", content: [] };
    });
    const never = new Promise<void>(() => undefined);

    const outcome = await executeControlledTool({
      ...input,
      eventSink: { emit: () => never },
    });

    expect(outcome.status).toBe("succeeded");
    expect(executions).toBe(1);
    expect("eventDelivery" in outcome && outcome.eventDelivery).toBe("scheduled");
  });

  it("keeps a durable indeterminate receipt when execution and event delivery fail", async () => {
    const journal = new MemoryJournal();
    const input = baseInput(journal, () => {
      throw new Error("provider may have applied the effect");
    });
    const eventSink: EventSink = {
      emit: () => Promise.reject(new Error("sink unavailable")),
    };

    const outcome = await executeControlledTool({ ...input, eventSink });
    const replay = await executeControlledTool({ ...input, facts: facts(), eventSink });

    expect(outcome.status).toBe("indeterminate");
    expect("receipt" in outcome && outcome.receipt.effectDisposition).toBe("unknown");
    expect("eventDelivery" in outcome && outcome.eventDelivery).toBe("scheduled");
    expect(replay.status).toBe("indeterminate");
  });

  it("never re-executes when terminal receipt persistence fails after an effect", async () => {
    const journal = new MemoryJournal();
    const append = journal.append.bind(journal);
    journal.append = async (request) => {
      if (request.transition.to === "succeeded") {
        throw new Error("durable store unavailable");
      }
      return append(request);
    };
    let executions = 0;
    const input = baseInput(journal, () => {
      executions += 1;
      return { toolCallId: CALL_ID, status: "succeeded", content: [] };
    });

    const outcome = await executeControlledTool(input);
    const receipt = [...journal.byId.values()][0];
    expect(outcome.status).toBe("indeterminate");
    expect(receipt?.state).toBe("indeterminate");
    const replay = await executeControlledTool({ ...input, facts: facts() });
    expect(replay.status).toBe("indeterminate");
    expect(executions).toBe(1);
  });

  it("fails closed when a receipt fence changes after started and before invocation", async () => {
    const journal = new MemoryJournal();
    const append = journal.append.bind(journal);
    journal.append = async (request) => {
      const result = await append(request);
      if (result.kind === "appended" && request.transition.to === "started") {
        const fence = result.receipt.executionFence;
        if (fence) {
          journal.byId.set(result.receipt.receiptId, {
            ...result.receipt,
            executionFence: {
              ...fence,
              owner: { ownerId: "worker:replacement" },
              token: fence.token + 1,
            },
          });
        }
      }
      return result;
    };
    let executions = 0;
    const outcome = await executeControlledTool(
      baseInput(journal, () => {
        executions += 1;
        return { toolCallId: CALL_ID, status: "succeeded", content: [] };
      }),
    );

    expect(outcome.status).toBe("indeterminate");
    expect(executions).toBe(0);
    expect("receipt" in outcome && outcome.receipt.state).toBe("started");
  });

  it("propagates the fence so a qualified provider rejects takeover after verification", async () => {
    const journal = new MemoryJournal();
    const verifyFence = journal.verifyFence.bind(journal);
    let replaced = false;
    journal.verifyFence = async (request) => {
      const verification = await verifyFence(request);
      if (!replaced && verification.kind === "active") {
        replaced = true;
        journal.now = "2026-07-29T00:02:00.000Z";
        await journal.claim({
          receiptId: verification.receipt.receiptId,
          expectedRevision: verification.receipt.revision,
          owner: { ownerId: "worker:replacement" },
          leaseDurationMs: 60_000,
          transitionId: coreId<EventId>(id(97)),
          redaction: { kind: "not-required" },
        });
      }
      return verification;
    };
    let externalEffects = 0;
    const outcome = await executeControlledTool(
      baseInput(journal, ({ receiptFence }) => {
        const currentReceipt = [...journal.byId.values()][0];
        const current = currentReceipt?.executionFence;
        if (
          !receiptFence ||
          !currentReceipt ||
          !current ||
          receiptFence.receiptId !== currentReceipt.receiptId ||
          receiptFence.token !== current.token ||
          receiptFence.ownerId !== current.owner.ownerId
        ) {
          throw new Error("qualified provider rejected stale receipt fence");
        }
        externalEffects += 1;
        return { toolCallId: CALL_ID, status: "succeeded", content: [] };
      }),
    );

    expect(replaced).toBe(true);
    expect(externalEffects).toBe(0);
    expect(outcome.status).toBe("indeterminate");
  });

  it("reconciles a stale indeterminate receipt from authoritative evidence without rerunning", async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    const initial = await executeControlledTool(
      baseInput(journal, () => {
        executions += 1;
        throw new Error("provider outcome unavailable");
      }),
    );
    if (!("receipt" in initial)) throw new Error("Expected a durable receipt.");
    const evidence = {
      evidenceId: coreId<EvidenceId>(id(98)),
      kind: "execution-receipt" as const,
      content: {
        resourceId: coreId<ResourceId>(id(99)),
        mediaType: "application/json; charset=utf-8",
        byteLength: 2,
        digest: digest("e".repeat(64)),
      },
      schema: schemaRef({
        schemaId: "https://schemas.example.test/tool-reconciliation",
        version: "1.0.0",
        digest: digest("f".repeat(64)),
      }),
    };
    const providerResult = {
      kind: "known" as const,
      disposition: "applied" as const,
      observedAt: "2026-07-29T00:02:00.000Z",
      evidence,
    };
    journal.now = "2026-07-29T00:02:00.000Z";
    const recovery = await reconcileControlledToolReceipt({
      receiptId: initial.receipt.receiptId,
      journal,
      receiptOwner: { ownerId: "worker:recovery" },
      receiptLeaseDurationMs: 60_000,
      facts: { ...facts(), now: () => "2026-07-29T00:02:00.000Z" },
      reconciler: {
        reconcile: () => Promise.resolve(providerResult),
      },
    });
    providerResult.evidence.content.mediaType = "text/plain";
    providerResult.evidence.schema.schemaId = "https://attacker.example.test/replaced";

    expect(recovery.status).toBe("reconciled");
    expect("receipt" in recovery && recovery.receipt.state).toBe("succeeded");
    expect("receipt" in recovery && recovery.receipt.effectDisposition).toBe("applied");
    expect("receipt" in recovery && recovery.receipt.reconciliation?.result).toMatchObject({
      kind: "known",
      disposition: "applied",
      evidence: {
        content: { mediaType: "application/json; charset=utf-8" },
        schema: { schemaId: "https://schemas.example.test/tool-reconciliation" },
      },
    });
    expect(executions).toBe(1);
  });

  it("keeps a fresh ambiguous receipt fenced and requires explicit unresolved recovery", async () => {
    const journal = new MemoryJournal();
    const initial = await executeControlledTool(
      baseInput(journal, () => {
        throw new Error("provider outcome unavailable");
      }),
    );
    if (!("receipt" in initial)) throw new Error("Expected a durable receipt.");
    let reconciliations = 0;
    const held = await reconcileControlledToolReceipt({
      receiptId: initial.receipt.receiptId,
      journal,
      receiptOwner: { ownerId: "worker:recovery" },
      receiptLeaseDurationMs: 60_000,
      facts: facts(),
      reconciler: {
        reconcile: () => {
          reconciliations += 1;
          return Promise.resolve({
            kind: "unresolved" as const,
            observedAt: "2026-07-29T00:00:00.000Z",
            reasonCode: "not-used",
          });
        },
      },
    });
    journal.now = "2026-07-29T00:02:00.000Z";
    const unresolved = await reconcileControlledToolReceipt({
      receiptId: initial.receipt.receiptId,
      journal,
      receiptOwner: { ownerId: "worker:recovery" },
      receiptLeaseDurationMs: 60_000,
      facts: { ...facts(), now: () => "2026-07-29T00:02:00.000Z" },
      reconciler: {
        reconcile: () => {
          reconciliations += 1;
          return Promise.resolve({
            kind: "unresolved" as const,
            observedAt: "2026-07-29T00:02:00.000Z",
            reasonCode: "provider-outcome-unknown",
          });
        },
      },
    });

    expect(held.status).toBe("held");
    expect(unresolved.status).toBe("reconciliation-required");
    expect("receipt" in unresolved && unresolved.receipt.state).toBe("reconciliation_required");
    expect(reconciliations).toBe(1);
  });

  it("rejects malformed reconciliation evidence and secret-bearing reason text", async () => {
    const journal = new MemoryJournal();
    const initial = await executeControlledTool(
      baseInput(journal, () => {
        throw new Error("provider outcome unavailable");
      }),
    );
    if (!("receipt" in initial)) throw new Error("Expected a durable receipt.");
    journal.now = "2026-07-29T00:02:00.000Z";
    const outcome = await reconcileControlledToolReceipt({
      receiptId: initial.receipt.receiptId,
      journal,
      receiptOwner: { ownerId: "worker:recovery" },
      receiptLeaseDurationMs: 60_000,
      facts: { ...facts(), now: () => "2026-07-29T00:02:00.000Z" },
      reconciler: {
        reconcile: () =>
          Promise.resolve({
            kind: "known",
            disposition: "applied",
            observedAt: "2026-07-29T00:02:00.000Z",
            evidence: {},
            reasonCode: "provider-secret-token",
          } as never),
      },
    });

    expect(outcome.status).toBe("reconciliation-required");
    expect("receipt" in outcome && outcome.receipt.reconciliation?.result).toEqual({
      kind: "unresolved",
      observedAt: "2026-07-29T00:02:00.000Z",
      reasonCode: "reconciliation-result-invalid",
    });
    expect(JSON.stringify(outcome)).not.toContain("provider-secret-token");
  });

  it("rejects a secret-bearing unresolved reason instead of persisting provider text", async () => {
    const journal = new MemoryJournal();
    const initial = await executeControlledTool(
      baseInput(journal, () => {
        throw new Error("provider outcome unavailable");
      }),
    );
    if (!("receipt" in initial)) throw new Error("Expected a durable receipt.");
    journal.now = "2026-07-29T00:02:00.000Z";
    const outcome = await reconcileControlledToolReceipt({
      receiptId: initial.receipt.receiptId,
      journal,
      receiptOwner: { ownerId: "worker:recovery" },
      receiptLeaseDurationMs: 60_000,
      facts: { ...facts(), now: () => "2026-07-29T00:02:00.000Z" },
      reconciler: {
        reconcile: () =>
          Promise.resolve({
            kind: "unresolved",
            observedAt: "2026-07-29T00:02:00.000Z",
            reasonCode: "provider-secret-token",
          } as never),
      },
    });

    expect(outcome.status).toBe("reconciliation-required");
    expect("receipt" in outcome && outcome.receipt.reconciliation?.result).toEqual({
      kind: "unresolved",
      observedAt: "2026-07-29T00:02:00.000Z",
      reasonCode: "reconciliation-result-invalid",
    });
    expect(JSON.stringify(outcome)).not.toContain("provider-secret-token");
  });

  it("turns hostile proxy and accessor reconciliation values into generic unresolved results", async () => {
    const hostileValues: unknown[] = [
      new Proxy(
        {},
        {
          getPrototypeOf: () => {
            throw new Error("provider-secret-from-proxy");
          },
        },
      ),
      Object.defineProperty(
        {
          observedAt: "2026-07-29T00:02:00.000Z",
          reasonCode: "provider-outcome-unknown",
        },
        "kind",
        {
          enumerable: true,
          get: () => {
            throw new Error("provider-secret-from-accessor");
          },
        },
      ),
      {
        kind: "known",
        disposition: {
          [Symbol.toPrimitive]: () => {
            throw new Error("provider-secret-from-coercion");
          },
        },
        observedAt: "2026-07-29T00:02:00.000Z",
        evidence: {},
      },
      {
        kind: "unresolved",
        observedAt: "2026-07-29T00:02:00.000Z",
        reasonCode: "provider-outcome-unknown",
        evidence: undefined,
      },
    ];

    for (const hostileValue of hostileValues) {
      const journal = new MemoryJournal();
      const initial = await executeControlledTool(
        baseInput(journal, () => {
          throw new Error("provider outcome unavailable");
        }),
      );
      if (!("receipt" in initial)) throw new Error("Expected a durable receipt.");
      journal.now = "2026-07-29T00:02:00.000Z";
      const outcome = await reconcileControlledToolReceipt({
        receiptId: initial.receipt.receiptId,
        journal,
        receiptOwner: { ownerId: "worker:recovery" },
        receiptLeaseDurationMs: 60_000,
        facts: { ...facts(), now: () => "2026-07-29T00:02:00.000Z" },
        reconciler: { reconcile: () => Promise.resolve(hostileValue as never) },
      });

      expect(outcome.status).toBe("reconciliation-required");
      expect("receipt" in outcome && outcome.receipt.reconciliation?.result).toEqual({
        kind: "unresolved",
        observedAt: "2026-07-29T00:02:00.000Z",
        reasonCode: "reconciliation-result-invalid",
      });
      expect(JSON.stringify(outcome)).not.toContain("provider-secret");
    }
  });

  it("preserves a post-start cancellation request through unresolved recovery", async () => {
    const journal = new MemoryJournal();
    let requested = false;
    const handlers = new Set<() => void>();
    const control = {
      isCancellationRequested: () => requested,
      onCancellationRequested: (handler: () => void) => {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
    };
    const initial = await executeControlledTool({
      ...baseInput(journal, () => {
        requested = true;
        handlers.forEach((handler) => handler());
        throw new Error("provider outcome unavailable");
      }),
      executionControl: control,
    });
    if (!("receipt" in initial)) throw new Error("Expected a durable receipt.");
    journal.now = "2026-07-29T00:02:00.000Z";
    const recovered = await reconcileControlledToolReceipt({
      receiptId: initial.receipt.receiptId,
      journal,
      receiptOwner: { ownerId: "worker:recovery" },
      receiptLeaseDurationMs: 60_000,
      facts: { ...facts(), now: () => "2026-07-29T00:02:00.000Z" },
      reconciler: {
        reconcile: () =>
          Promise.resolve({
            kind: "unresolved" as const,
            observedAt: "2026-07-29T00:02:00.000Z",
            reasonCode: "provider-outcome-unknown",
          }),
      },
    });

    expect(recovered.status).toBe("reconciliation-required");
    expect("receipt" in recovered && recovered.receipt.cancellation).toMatchObject({
      runId: RUN_ID,
      toolCallId: CALL_ID,
    });
    expect("receipt" in recovered && recovered.receipt.effectDisposition).toBe("unknown");
  });
});
