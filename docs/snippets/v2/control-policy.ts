import {
  authorizePolicyDecision,
  type PolicyDecision,
  type PolicyEvaluationRef,
} from "@geekist/llm-core/control";
import { contractVersion } from "@geekist/llm-core/contracts";

declare const evaluation: PolicyEvaluationRef;

const decision: PolicyDecision = {
  evaluation,
  policyId: "example.tool-policy",
  policyVersion: contractVersion("1.0.0"),
  decidedAt: "2026-07-30T00:00:00.000Z",
  decision: "require-approval",
};

const authorization = authorizePolicyDecision(evaluation, decision);

if (authorization.status === "denied") {
  throw new Error(authorization.reason);
}
