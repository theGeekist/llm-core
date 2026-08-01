import type { EvidenceId, EventId, PrincipalRef, SecretRef } from "#contracts";
import type {
  ApprovalAuthenticationPort,
  ApprovalId,
  CancellationId,
  ConcurrencyGate,
  PolicyEvaluationId,
  PolicyEvaluationPort,
} from "../../features/control/runtime";
import type { ApprovalDecision, ApprovalRequest } from "../../features/control/public";
import type {
  EventSink,
  RedactionMetadata,
  ToolExecutionReceipt,
  ToolReceiptJournal,
} from "../../features/evidence/public";
import type {
  ActionDigestPort,
  BoundAction,
  ExecutableTool,
  ToolCall,
  ToolExecutionControl,
  ToolExecutionResult,
} from "../../features/tooling/orchestration";
import type { ToolDefinition } from "../../features/tooling/runtime";
import type {
  CompiledSpecification,
  SpecificationAuthorityDependencies,
} from "../specification-compiler/types";

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

/**
 * Portable declarative target for one controlled invocation.  The bound
 * action fixes the complete action document (including arguments and caller
 * authority); the tool projection makes the effect semantics explicit.
 */
export interface ControlledToolExecutionPlan {
  readonly tool: Pick<ToolDefinition, "id" | "version" | "effect" | "execution">;
  readonly action: Pick<BoundAction, "canonicalDocument" | "digest">;
}

/** Authority binding for the exact controlled invocation target. */
export interface ControlledToolSpecificationAuthority {
  readonly compiled: CompiledSpecification<ControlledToolExecutionPlan>;
  readonly authority: SpecificationAuthorityDependencies;
}

export interface ExecuteControlledToolInput {
  tool: ExecutableTool;
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
  specification?: ControlledToolSpecificationAuthority;
}

export type EventDelivery = "failed" | "not-configured" | "scheduled";

interface ReceiptOutcome {
  receipt: ToolExecutionReceipt;
  eventDelivery: EventDelivery;
}

export type ControlledToolExecutionOutcome =
  | (ReceiptOutcome & {
      status: "succeeded";
      result: Extract<ToolExecutionResult, { status: "succeeded" }>;
    })
  | (ReceiptOutcome & {
      status: "failed";
      result: Extract<ToolExecutionResult, { status: "failed" }>;
    })
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
