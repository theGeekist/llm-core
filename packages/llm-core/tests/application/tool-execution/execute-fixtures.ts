import { createHmac } from "node:crypto";
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
  type RunId,
  type StepId,
  type TenantId,
  type ToolCallId,
} from "#contracts";
import { type PolicyDecision } from "../../../src/features/control/public";
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
  type ToolCall,
  type ToolDefinition,
  type ToolExecutionFactsPort,
} from "../../../src/tools/runtime";

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

export {
  RUN_ID,
  CALL_ID,
  REPLAY_RUN_ID,
  REPLAY_CALL_ID,
  STEP_ID,
  REPLAY_STEP_ID,
  UUID_V4,
  KEY_REF,
  digestPort,
  INPUT_SCHEMA,
  SPEC,
  call,
  MemoryJournal,
  id,
  facts,
  allowPolicy,
  baseInput,
};
