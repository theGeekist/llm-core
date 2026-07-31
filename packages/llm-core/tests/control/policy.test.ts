import { describe, expect, test } from "bun:test";
import type { PolicyDecision } from "../../src/features/control/public";
import { authorizePolicyDecision } from "../../src/features/control/runtime";
import { ACTION_DIGEST, OTHER_ACTION_DIGEST, VERSION, policyRef } from "./helpers";

const decision = (
  value: PolicyDecision["decision"],
  overrides: Partial<PolicyDecision> = {},
): PolicyDecision =>
  ({
    evaluation: policyRef(),
    policyId: "llm-core.tool-policy",
    policyVersion: VERSION,
    decidedAt: "2026-07-29T10:00:00.000Z",
    decision: value,
    ...overrides,
  }) as PolicyDecision;

describe("policy authorization", () => {
  test("accepts allow and preserves require-approval as a distinct disposition", () => {
    expect(authorizePolicyDecision(policyRef(), decision("allow")).status).toBe("allowed");
    expect(authorizePolicyDecision(policyRef(), decision("require-approval")).status).toBe(
      "approval-required",
    );
  });

  test("deny and unknown decisions fail closed", () => {
    expect(authorizePolicyDecision(policyRef(), decision("deny"))).toMatchObject({
      status: "denied",
      reason: "decision-denied",
    });
    expect(
      authorizePolicyDecision(policyRef(), {
        ...decision("allow"),
        decision: "unknown",
      }),
    ).toMatchObject({
      status: "denied",
      reason: "missing-or-invalid-decision",
    });
  });

  test("rejects missing or invalid policy provenance", () => {
    expect(
      authorizePolicyDecision(policyRef(), {
        evaluation: policyRef(),
        decision: "allow",
      }),
    ).toMatchObject({
      status: "denied",
      reason: "missing-or-invalid-decision",
    });
    expect(
      authorizePolicyDecision(policyRef(), {
        ...decision("allow"),
        decidedAt: "not-a-timestamp",
      }),
    ).toMatchObject({
      status: "denied",
      reason: "missing-or-invalid-decision",
    });
  });

  test("rejects an action digest changed after policy evaluation", () => {
    const changed = decision("allow", {
      evaluation: policyRef(OTHER_ACTION_DIGEST),
    });
    expect(authorizePolicyDecision(policyRef(ACTION_DIGEST), changed)).toMatchObject({
      status: "denied",
      reason: "action-digest-mismatch",
    });
  });

  test("malformed digest-shaped input fails closed without throwing", () => {
    expect(
      authorizePolicyDecision(policyRef(), {
        ...decision("allow"),
        evaluation: {
          ...policyRef(),
          actionDigest: { algorithm: "hmac-sha-256" },
        },
      }),
    ).toMatchObject({
      status: "denied",
      reason: "missing-or-invalid-decision",
    });
  });
});
