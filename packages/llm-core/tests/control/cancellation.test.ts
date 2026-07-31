import { describe, expect, test } from "bun:test";
import {
  type CancellationAcknowledgement,
  type CancellationRequest,
} from "../../src/features/control/public";
import { resolveCancellation } from "../../src/features/control/runtime";
import { cancellationRef, principal } from "./helpers";

const request = (phase: CancellationRequest["phase"]): CancellationRequest => ({
  cancellation: cancellationRef(),
  phase,
  requestedAt: "2026-07-29T10:00:00.000Z",
  requestedBy: principal("user:operator"),
});

describe("cancellation semantics", () => {
  test("after-start cancellation remains pending until a known disposition is acknowledged", () => {
    const pending: CancellationAcknowledgement = {
      cancellation: cancellationRef(),
      status: "pending-after-start",
      acknowledgedAt: "2026-07-29T10:00:01.000Z",
    };
    expect(resolveCancellation(request("after-start"), pending).status).toBe("pending");

    const acknowledged: CancellationAcknowledgement = {
      cancellation: cancellationRef(),
      status: "acknowledged-after-start",
      acknowledgedAt: "2026-07-29T10:00:02.000Z",
      effectDisposition: "partial",
    };
    expect(resolveCancellation(request("after-start"), acknowledged)).toMatchObject({
      status: "cancelled-after-start",
      effectDisposition: "partial",
    });
  });

  test("acknowledgements cannot change the requested cancellation phase", () => {
    const acknowledgement: CancellationAcknowledgement = {
      cancellation: cancellationRef(),
      status: "acknowledged-after-start",
      acknowledgedAt: "2026-07-29T10:00:02.000Z",
      effectDisposition: "none",
    };
    expect(resolveCancellation(request("before-start"), acknowledgement)).toEqual({
      status: "rejected",
      reason: "phase-mismatch",
    });
  });
});
