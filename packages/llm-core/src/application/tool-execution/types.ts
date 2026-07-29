import type { EvidenceId, EventId, PrincipalRef, SecretRef } from "#contracts";
import type {
  ApprovalAuthenticationPort,
  ApprovalDecision,
  ApprovalId,
  ApprovalRequest,
  CancellationId,
  ConcurrencyGate,
  PolicyEvaluationId,
  PolicyEvaluationPort,
} from "../../features/control/public";
import type {
  EventSink,
  RedactionMetadata,
  ToolExecutionReceipt,
  ToolReceiptJournal,
} from "../../features/evidence/public";
import type {
  ActionDigestPort,
  ToolBinding,
  ToolCall,
  ToolExecutionControl,
  ToolResult,
} from "../../features/tooling/public";

export interface ToolExecutionFactsPort {
  now(): string;
  newReceiptId(): EvidenceId;
  newEventId(): EventId;
  newPolicyEvaluationId(): PolicyEvaluationId;
  newApprovalId(): ApprovalId;
  newCancellationId(): CancellationId;
}

export interface ToolApprovalPort {
  request(input: ApprovalRequest): Promise<ApprovalDecision | null>;
  authenticator: ApprovalAuthenticationPort;
  expiresAt: string | ((requestedAt: string) => string);
  requiredApprover?: PrincipalRef;
}

export interface ExecuteControlledToolInput {
  binding: ToolBinding;
  call: ToolCall;
  securityDomain: string;
  digestKeyRef: SecretRef;
  digestPort: ActionDigestPort;
  policy?: PolicyEvaluationPort;
  approval?: ToolApprovalPort;
  journal: ToolReceiptJournal;
  concurrency: ConcurrencyGate;
  facts: ToolExecutionFactsPort;
  eventSink?: EventSink;
  executionControl?: ToolExecutionControl;
  redaction?: RedactionMetadata;
}

export type EventDelivery = "failed" | "not-configured" | "scheduled";

interface ReceiptOutcome {
  receipt: ToolExecutionReceipt;
  eventDelivery: EventDelivery;
}

export type ControlledToolExecutionOutcome =
  | (ReceiptOutcome & { status: "succeeded"; result: Extract<ToolResult, { status: "succeeded" }> })
  | (ReceiptOutcome & { status: "failed"; result: Extract<ToolResult, { status: "failed" }> })
  | (ReceiptOutcome & {
      status: "awaiting-approval" | "cancelled" | "denied" | "existing" | "indeterminate";
    })
  | {
      status: "conflict";
      existingReceiptId: EvidenceId;
    };

export class ToolExecutionCoordinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolExecutionCoordinationError";
  }
}
