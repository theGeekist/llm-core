/* eslint-disable sonarjs/cognitive-complexity -- branches mirror durable policy and approval states */
import type { JsonValue } from "#contracts";
import {
  approvalId,
  authorizePolicyDecision,
  policyEvaluationId,
  verifyApproval,
  type PolicyEvaluationRef,
} from "../../features/control/runtime";
import type { ApprovalDecision, ApprovalRef, PolicyFact } from "../../features/control/public";
import type { BoundAction } from "../../features/tooling/orchestration";
import { isExpired } from "./execution-control";
import { mergeDelivery } from "./event-projection";
import { mintedId } from "./execution-invariants";
import { appendReceipt } from "./receipt-persistence";
import type { ControlledExecutionPhase, ControlledToolExecutionOutcome } from "./types";

const policyFacts = (bound: BoundAction): PolicyFact[] => [
  { name: "tool.id", value: bound.document.tool.id },
  { name: "tool.version", value: bound.document.tool.version },
  { name: "tool.input-schema-digest", value: bound.document.tool.inputSchemaDigest },
  { name: "effect.class", value: bound.document.effect.class },
  { name: "effect.targets", value: bound.document.effect.targets as unknown as JsonValue },
  { name: "execution.semantics", value: bound.document.execution as unknown as JsonValue },
  { name: "action.arguments", value: bound.document.arguments },
];

type AuthorizationResult =
  | { kind: "ready"; phase: ControlledExecutionPhase }
  | { kind: "outcome"; outcome: ControlledToolExecutionOutcome };

export const authorizeExecution = async (
  phase: ControlledExecutionPhase,
): Promise<AuthorizationResult> => {
  const { input, bound, isMeaningful } = phase;
  const runId = phase.receipt.runId;
  let { receipt, delivery } = phase;

  if (receipt.state === "reserved") {
    if (isMeaningful && !input.policy) {
      const denied = await appendReceipt(input, receipt, "denied", "not-started", {
        reasonCode: "policy-required-for-meaningful-effect",
      });
      return {
        kind: "outcome",
        outcome: {
          status: "denied",
          receipt: denied.receipt,
          eventDelivery: mergeDelivery(delivery, denied.delivery),
        },
      };
    }
    const policy: PolicyEvaluationRef | undefined = input.policy
      ? {
          policyEvaluationId: policyEvaluationId(
            mintedId(input.facts.newPolicyEvaluationId(), "Tool policy evaluation"),
          ),
          runId,
          toolCallId: input.call.toolCallId,
          actionDigest: bound.digest,
        }
      : undefined;
    const awaiting = await appendReceipt(input, receipt, "awaiting_policy", "not-started", {
      policy,
      reasonCode: policy ? "policy-evaluation-requested" : "policy-not-required-read-only",
    });
    receipt = awaiting.receipt;
    delivery = mergeDelivery(delivery, awaiting.delivery);
  }

  if (receipt.state === "awaiting_policy") {
    if (!receipt.policy) {
      const ready = await appendReceipt(input, receipt, "ready", "not-started", {
        reasonCode: "policy-not-required-read-only",
      });
      receipt = ready.receipt;
      delivery = mergeDelivery(delivery, ready.delivery);
    } else {
      let decision: unknown;
      try {
        decision = await input.policy?.evaluate({
          evaluation: receipt.policy,
          principal: input.call.invocation.principal,
          tenant: input.call.invocation.tenant,
          facts: policyFacts(bound),
        });
      } catch {
        decision = null;
      }
      const authorization = authorizePolicyDecision(receipt.policy, decision);
      if (authorization.status === "denied") {
        const denied = await appendReceipt(input, receipt, "denied", "not-started", {
          policy: receipt.policy,
          reasonCode: `policy-${authorization.reason}`,
        });
        return {
          kind: "outcome",
          outcome: {
            status: "denied",
            receipt: denied.receipt,
            eventDelivery: mergeDelivery(delivery, denied.delivery),
          },
        };
      }
      if (authorization.status === "allowed") {
        const ready = await appendReceipt(input, receipt, "ready", "not-started", {
          policy: receipt.policy,
        });
        receipt = ready.receipt;
        delivery = mergeDelivery(delivery, ready.delivery);
      } else {
        const approval: ApprovalRef = {
          approvalId: approvalId(mintedId(input.facts.newApprovalId(), "Tool approval")),
          runId,
          toolCallId: input.call.toolCallId,
          actionDigest: bound.digest,
        };
        const waiting = await appendReceipt(input, receipt, "awaiting_approval", "not-started", {
          policy: receipt.policy,
          approval,
        });
        receipt = waiting.receipt;
        delivery = mergeDelivery(delivery, waiting.delivery);
      }
    }
  }

  if (receipt.state !== "awaiting_approval") {
    return { kind: "ready", phase: { ...phase, receipt, delivery } };
  }
  if (!input.approval || !receipt.approval) {
    return {
      kind: "outcome",
      outcome: { status: "awaiting-approval", receipt, eventDelivery: delivery },
    };
  }

  const currentApproval = receipt.approval;
  const requestedAt = receipt.approvalRequestedAt ?? input.facts.now();
  const expiresAt =
    receipt.approvalExpiresAt ??
    (typeof input.approval.expiresAt === "function"
      ? input.approval.expiresAt(requestedAt)
      : input.approval.expiresAt);
  if (!receipt.approvalRequestedAt || !receipt.approvalExpiresAt) {
    const requested = await appendReceipt(input, receipt, "awaiting_approval", "not-started", {
      policy: receipt.policy,
      approval: currentApproval,
      approvalRequestedAt: requestedAt,
      approvalExpiresAt: expiresAt,
      approvalRequiredApprover: input.approval.requiredApprover,
      reasonCode: "approval-request-recorded",
    });
    receipt = requested.receipt;
    delivery = mergeDelivery(delivery, requested.delivery);
  }
  if (isExpired(receipt.approvalExpiresAt, input.facts.now())) {
    const expired = await appendReceipt(input, receipt, "expired", "not-started", {
      policy: receipt.policy,
      approval: currentApproval,
      approvalRequestedAt: receipt.approvalRequestedAt,
      approvalExpiresAt: receipt.approvalExpiresAt,
      approvalRequiredApprover: receipt.approvalRequiredApprover,
      reasonCode: "approval-expired-before-decision",
    });
    return {
      kind: "outcome",
      outcome: {
        status: "denied",
        receipt: expired.receipt,
        eventDelivery: mergeDelivery(delivery, expired.delivery),
      },
    };
  }
  const request = {
    approval: currentApproval,
    requestedAt: receipt.approvalRequestedAt ?? requestedAt,
    expiresAt: receipt.approvalExpiresAt ?? expiresAt,
    requiredApprover: receipt.approvalRequiredApprover,
  };
  let decision: ApprovalDecision | null;
  try {
    decision = await input.approval.request(request);
  } catch {
    decision = null;
  }
  if (!decision) {
    return {
      kind: "outcome",
      outcome: { status: "awaiting-approval", receipt, eventDelivery: delivery },
    };
  }
  const verification = await verifyApproval({
    request,
    decision,
    authenticator: input.approval.authenticator,
    now: input.facts.now(),
  });
  if (verification.status !== "approved") {
    const terminalState =
      verification.reason === "expired" || verification.reason === "outside-approval-window"
        ? "expired"
        : "denied";
    const denied = await appendReceipt(input, receipt, terminalState, "not-started", {
      policy: receipt.policy,
      approval: currentApproval,
      approvalRequestedAt: requestedAt,
      approvalExpiresAt: expiresAt,
      approvalRequiredApprover: receipt.approvalRequiredApprover,
      reasonCode: `approval-${verification.reason}`,
    });
    return {
      kind: "outcome",
      outcome: {
        status: "denied",
        receipt: denied.receipt,
        eventDelivery: mergeDelivery(delivery, denied.delivery),
      },
    };
  }
  const ready = await appendReceipt(input, receipt, "ready", "not-started", {
    policy: receipt.policy,
    approval: currentApproval,
    approvalRequestedAt: requestedAt,
    approvalExpiresAt: expiresAt,
    approvalRequiredApprover: receipt.approvalRequiredApprover,
    authorizedEvidence: decision.authentication.evidence,
  });
  return {
    kind: "ready",
    phase: {
      ...phase,
      receipt: ready.receipt,
      delivery: mergeDelivery(delivery, ready.delivery),
    },
  };
};
