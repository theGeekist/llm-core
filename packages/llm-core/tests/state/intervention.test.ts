import { describe, expect, test } from "bun:test";
import { secretRef } from "#contracts";
import { actionDigest } from "../../src/features/tooling/runtime";
import { createInterventionRequest, resolveIntervention } from "../../src/features/state/public";
import {
  CHECKPOINT_ID,
  EXPIRES,
  INTERVENTION_ID,
  LATER,
  NOW,
  RUN_ID,
  STEP_ONE,
  decision,
  intervention,
  principal,
} from "./helpers";

describe("action-bound interventions", () => {
  test("keeps all six intervention decisions semantically distinct", () => {
    expect(resolveIntervention(intervention(), decision("approve"), LATER)).toEqual({
      status: "approved",
    });
    expect(resolveIntervention(intervention(), decision("deny"), LATER).status).toBe("denied");
    expect(resolveIntervention(intervention(), decision("defer"), LATER).status).toBe("deferred");
    expect(resolveIntervention(intervention(), decision("edit"), LATER)).toEqual({
      status: "edit-requires-new-binding",
      replacementArguments: { query: "safer" },
      reason: undefined,
    });
    expect(resolveIntervention(intervention(), decision("cancel"), LATER).status).toBe("cancelled");
    expect(resolveIntervention(intervention(), decision("escalate"), LATER).status).toBe(
      "escalated",
    );
  });

  test("rejects wrong identity, checkpoint revision, action binding and stale decisions", () => {
    const request = intervention();
    const wrongIdentity = {
      ...decision("approve"),
      intervention: { ...request.intervention, interventionId: INTERVENTION_ID.replace(/5$/, "6") },
    };
    const wrongCheckpoint = {
      ...decision("approve"),
      intervention: { ...request.intervention, checkpointRevision: 2 },
    };
    const wrongDigest = {
      ...decision("approve"),
      intervention: {
        ...request.intervention,
        actionDigest: actionDigest(
          "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
          secretRef("state:test-key"),
        ),
      },
    };
    const stale = { ...decision("approve"), decidedAt: "2026-07-29T11:59:00.000Z" };

    expect(
      resolveIntervention(request, wrongIdentity as ReturnType<typeof decision>, LATER),
    ).toEqual({
      status: "rejected",
      reason: "identity-mismatch",
    });
    expect(resolveIntervention(request, wrongCheckpoint, LATER)).toEqual({
      status: "rejected",
      reason: "checkpoint-mismatch",
    });
    expect(resolveIntervention(request, wrongDigest, LATER)).toEqual({
      status: "rejected",
      reason: "action-digest-mismatch",
    });
    expect(resolveIntervention(request, stale, LATER)).toEqual({
      status: "rejected",
      reason: "stale-decision",
    });
  });

  test("requires canonical action digests at request creation", () => {
    expect(() =>
      createInterventionRequest({
        intervention: {
          interventionId: INTERVENTION_ID,
          checkpointId: CHECKPOINT_ID,
          checkpointRevision: 3,
          runId: RUN_ID,
          stepId: STEP_ONE,
          actionDigest: {
            algorithm: "hmac-sha-256",
            keyRef: secretRef("state:test-key"),
            value: "not-canonical",
          } as ReturnType<typeof actionDigest>,
        },
        requestedAt: NOW,
        expiresAt: EXPIRES,
        allowed: ["approve"],
      }),
    ).toThrow();
  });

  test("rejects expired and future-dated decisions against the trusted current time", () => {
    expect(resolveIntervention(intervention(), decision("approve"), EXPIRES)).toEqual({
      status: "rejected",
      reason: "outside-intervention-window",
    });
    expect(
      resolveIntervention(
        intervention(),
        { ...decision("approve"), decidedAt: "2026-07-29T12:02:00.000Z" },
        LATER,
      ),
    ).toEqual({
      status: "rejected",
      reason: "outside-intervention-window",
    });
  });

  test("edit does not transfer approval to replacement arguments", () => {
    const edited = resolveIntervention(intervention(), decision("edit"), LATER);
    expect(edited.status).toBe("edit-requires-new-binding");
    expect(edited.status === "edit-requires-new-binding" && edited.replacementArguments).toEqual({
      query: "safer",
    });

    const replacementRequest = createInterventionRequest({
      intervention: {
        interventionId: INTERVENTION_ID,
        checkpointId: CHECKPOINT_ID,
        checkpointRevision: 3,
        runId: RUN_ID,
        stepId: STEP_ONE,
        actionDigest: actionDigest(
          "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
          secretRef("state:test-key"),
        ),
      },
      requestedAt: LATER,
      expiresAt: EXPIRES,
      allowed: ["approve"],
    });
    expect(resolveIntervention(replacementRequest, decision("approve"), LATER)).toEqual({
      status: "rejected",
      reason: "action-digest-mismatch",
    });
    expect(String(principal.principalId)).toBe("operator:jason");
  });
});
