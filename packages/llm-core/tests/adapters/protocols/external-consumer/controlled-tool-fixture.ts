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
  type ToolCallId,
} from "@geekist/llm-core/contracts";
import {
  approvalId,
  cancellationId,
  createConcurrencyGate,
  policyEvaluationId,
} from "@geekist/llm-core/control/runtime";
import type {
  AppendToolReceiptTransition,
  AppendToolReceiptTransitionResult,
  ClaimToolReceiptExecution,
  ClaimToolReceiptExecutionResult,
  LookupToolReceiptByIdempotency,
  ReserveToolReceipt,
  ReserveToolReceiptResult,
  ToolExecutionReceipt,
  ToolReceiptFence,
  ToolReceiptJournal,
} from "@geekist/llm-core/evidence";
import type { McpToolBinding } from "@geekist/llm-core/mcp";
import {
  actionDigest,
  createExecutableTool,
  registerToolSchema,
  toolId,
  type ActionDigestPort,
  type ToolCall,
  type ToolExecutionFactsPort,
} from "@geekist/llm-core/tools/runtime";

const RUN_ID = coreId<RunId>("018f0f4e-8c5b-7a91-8c3b-223456789001");
const CALL_ID = coreId<ToolCallId>("018f0f4e-8c5b-7a91-8c3b-223456789002");
const INVOCATION_ID = coreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-223456789003");
const NOW = "2026-08-09T00:00:00.000Z";

const keyOf = (request: ReserveToolReceipt | LookupToolReceiptByIdempotency): string =>
  JSON.stringify(request.key);

export class PackedJournal implements ToolReceiptJournal {
  readonly receipts = new Map<EvidenceId, ToolExecutionReceipt>();
  private readonly byKey = new Map<string, EvidenceId>();

  async reserve(request: ReserveToolReceipt): Promise<ReserveToolReceiptResult> {
    const existingId = this.byKey.get(keyOf(request));
    if (existingId) {
      return {
        kind: "existing",
        receipt: this.receipts.get(existingId)!,
        durable: "acknowledged",
      };
    }
    const receipt: ToolExecutionReceipt = {
      ...request,
      revision: 0,
      state: "reserved",
      effectDisposition: "not-started",
      history: [],
    };
    this.receipts.set(receipt.receiptId, receipt);
    this.byKey.set(keyOf(request), receipt.receiptId);
    return { kind: "created", receipt, durable: "acknowledged" };
  }

  async append(request: AppendToolReceiptTransition): Promise<AppendToolReceiptTransitionResult> {
    const current = this.receipts.get(request.receiptId);
    if (!current) return { kind: "not-found", receiptId: request.receiptId };
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
      executionFence: entry.fence ?? current.executionFence,
      history: [...current.history, entry],
    };
    this.receipts.set(receipt.receiptId, receipt);
    return { kind: "appended", receipt, entry, durable: "acknowledged" };
  }

  async claim(request: ClaimToolReceiptExecution): Promise<ClaimToolReceiptExecutionResult> {
    const current = this.receipts.get(request.receiptId);
    if (!current) return { kind: "not-found", receiptId: request.receiptId };
    const fence: ToolReceiptFence = {
      owner: request.owner,
      token: 1,
      acquiredAt: NOW,
      expiresAt: "2026-08-09T00:01:00.000Z",
    };
    const entry = {
      transitionId: request.transitionId,
      from: current.state,
      to: current.state,
      recordedAt: NOW,
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
    this.receipts.set(receipt.receiptId, receipt);
    return { kind: "claimed", receipt, fence, entry, durable: "acknowledged" };
  }

  async verifyFence({ receiptId }: { receiptId: EvidenceId; fence: ToolReceiptFence }) {
    const receipt = this.receipts.get(receiptId) ?? null;
    return receipt ? { kind: "active" as const, receipt } : { kind: "inactive" as const, receipt };
  }

  async load({ receiptId }: { receiptId: EvidenceId }): Promise<ToolExecutionReceipt | null> {
    return this.receipts.get(receiptId) ?? null;
  }

  async loadByIdempotency(
    request: LookupToolReceiptByIdempotency,
  ): Promise<ToolExecutionReceipt | null> {
    const receiptId = this.byKey.get(keyOf(request));
    return receiptId ? (this.receipts.get(receiptId) ?? null) : null;
  }
}

const schema = await registerToolSchema(
  {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false,
  },
  { digest: () => digest("a".repeat(64)) },
);

const definition = {
  id: toolId("external.echo"),
  version: contractVersion("1.0.0"),
  description: "Echo a controlled value.",
  inputSchema: schema,
  effect: { class: "read-only" as const, targets: [] },
  execution: {
    concurrency: "shared" as const,
    cancellation: "cooperative" as const,
    idempotency: "not-supported" as const,
    retryAfterStart: "never" as const,
  },
};

const tool = createExecutableTool({
  definition,
  argumentValidator: {
    validate: ({ arguments: argumentsValue }) =>
      typeof (argumentsValue as { value?: unknown }).value === "string"
        ? { valid: true }
        : {
            valid: false,
            issues: [{ path: "$.value", code: "type", safeMessage: "must be a string" }],
          },
  },
  execute: ({ call }) => ({
    toolCallId: call.toolCallId,
    status: "succeeded",
    content: [
      { kind: "text", text: `packed-consumer:${(call.arguments as { value: string }).value}` },
    ],
  }),
});

const digestPort: ActionDigestPort = {
  create: ({ canonicalDocument, securityDomain, keyRef }) =>
    actionDigest(
      createHmac("sha256", "packed-consumer-key")
        .update(securityDomain)
        .update("\0")
        .update(canonicalDocument)
        .digest("base64url"),
      keyRef,
    ),
  verify: () => true,
};

const facts = (): ToolExecutionFactsPort => {
  let ordinal = 10;
  const next = () =>
    `018f0f4e-8c5b-7a91-8c3b-${String(223456780000 + ordinal++).padStart(12, "0")}`;
  return {
    now: () => NOW,
    newReceiptId: () => coreId<EvidenceId>(next()),
    newEventId: () => coreId<EventId>(next()),
    newPolicyEvaluationId: () => policyEvaluationId(next()),
    newApprovalId: () => approvalId(next()),
    newCancellationId: () => cancellationId(next()),
  };
};

export const packedControlledBinding = (): {
  readonly binding: McpToolBinding;
  readonly journal: PackedJournal;
} => {
  const journal = new PackedJournal();
  const call: ToolCall = {
    toolCallId: CALL_ID,
    toolId: definition.id,
    toolVersion: definition.version,
    arguments: { value: "initial" },
    invocation: {
      invocationId: INVOCATION_ID,
      runId: RUN_ID,
      principal: { principalId: externalId<PrincipalId>("packed:consumer") },
    },
  };
  return {
    journal,
    binding: {
      definition: { name: "echo", description: definition.description },
      tool,
      prepareControlledExecution: ({ arguments: argumentsValue }) => ({
        call: { ...call, arguments: argumentsValue },
        securityDomain: "packed:consumer",
        digestKeyRef: secretRef("vault:packed-consumer/current"),
        digestPort,
        journal,
        receiptOwner: { ownerId: "packed-consumer" },
        receiptLeaseDurationMs: 60_000,
        concurrency: createConcurrencyGate(),
        facts: facts(),
      }),
    },
  };
};
