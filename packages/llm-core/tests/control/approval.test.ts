import { describe, expect, test } from "bun:test";
import type { ApprovalDecision, ApprovalRequest } from "../../src/features/control/public";
import {
  verifyApproval,
  type ApprovalAuthenticationPort,
} from "../../src/features/control/runtime";
import { OTHER_ACTION_DIGEST, approvalRef, authenticationEvidence, principal } from "./helpers";

const APPROVER = principal("user:approver");

const request = (): ApprovalRequest => ({
  approval: approvalRef(),
  requestedAt: "2026-07-29T10:00:00.000Z",
  expiresAt: "2026-07-29T10:10:00.000Z",
  requiredApprover: APPROVER,
});

const decision = (): ApprovalDecision => ({
  approval: approvalRef(),
  decision: "approve",
  decidedAt: "2026-07-29T10:05:00.000Z",
  actor: APPROVER,
  authentication: {
    scheme: "webauthn",
    evidence: authenticationEvidence,
  },
});

const authenticator = (actor = APPROVER): ApprovalAuthenticationPort => ({
  verify: () => ({ status: "authenticated", principal: actor }),
});

describe("approval verification", () => {
  test("accepts an authenticated, identity-bound, unexpired exact action", async () => {
    await expect(
      verifyApproval({
        request: request(),
        decision: decision(),
        authenticator: authenticator(),
        now: "2026-07-29T10:06:00.000Z",
      }),
    ).resolves.toMatchObject({ status: "approved", actor: APPROVER });
  });

  test("a changed action digest invalidates approval", async () => {
    await expect(
      verifyApproval({
        request: request(),
        decision: {
          ...decision(),
          approval: approvalRef(OTHER_ACTION_DIGEST),
        },
        authenticator: authenticator(),
        now: "2026-07-29T10:06:00.000Z",
      }),
    ).resolves.toEqual({
      status: "rejected",
      reason: "action-digest-mismatch",
    });
  });

  test("actor identity mismatch and expiry reject", async () => {
    await expect(
      verifyApproval({
        request: request(),
        decision: decision(),
        authenticator: authenticator(principal("user:other")),
        now: "2026-07-29T10:06:00.000Z",
      }),
    ).resolves.toEqual({ status: "rejected", reason: "identity-mismatch" });

    await expect(
      verifyApproval({
        request: request(),
        decision: decision(),
        authenticator: authenticator(),
        now: "2026-07-29T10:10:00.000Z",
      }),
    ).resolves.toEqual({ status: "rejected", reason: "expired" });
  });

  test("decisions before the request or after verification time reject", async () => {
    for (const decidedAt of ["2026-07-29T09:59:59.000Z", "2026-07-29T10:07:00.000Z"]) {
      await expect(
        verifyApproval({
          request: request(),
          decision: { ...decision(), decidedAt },
          authenticator: authenticator(),
          now: "2026-07-29T10:06:00.000Z",
        }),
      ).resolves.toEqual({
        status: "rejected",
        reason: "outside-approval-window",
      });
    }
  });

  test("deny and failed authentication fail closed", async () => {
    await expect(
      verifyApproval({
        request: request(),
        decision: { ...decision(), decision: "deny" },
        authenticator: authenticator(),
        now: "2026-07-29T10:06:00.000Z",
      }),
    ).resolves.toEqual({ status: "rejected", reason: "decision-denied" });

    await expect(
      verifyApproval({
        request: request(),
        decision: decision(),
        authenticator: {
          verify: () => ({ status: "rejected", reason: "invalid-signature" }),
        },
        now: "2026-07-29T10:06:00.000Z",
      }),
    ).resolves.toEqual({ status: "rejected", reason: "unauthenticated" });
  });
});
