/* eslint-disable max-lines -- one scenario suite exercises the complete receipt state machine */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "bun:test";
import {
  contractVersion,
  coreId,
  digest,
  externalId,
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
  type EventSink,
  type LookupToolReceiptByIdempotency,
  type ReserveToolReceipt,
  type ReserveToolReceiptResult,
  type ToolExecutionReceipt,
  type ToolReceiptJournal,
} from "../../../src/features/evidence/public";
import {
  classifyExistingReservation,
  isToolReceiptTransitionAllowed,
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
      history: [...current.history, entry],
    };
    this.byId.set(receipt.receiptId, receipt);
    return { kind: "appended", receipt, entry, durable: "acknowledged" };
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
  concurrency: createConcurrencyGate(),
  facts: facts(),
});

describe("controlled tool execution", () => {
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
});
