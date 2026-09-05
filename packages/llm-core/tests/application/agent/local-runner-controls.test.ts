import { newCoreId, type EventId } from "#contracts";
import { describe, expect, test } from "bun:test";
import { type InterventionAuthenticationPort } from "../../../src/features/state/public";
import { decision, principal } from "../../state/resumable-checkpoint-fixtures";

import {
  IDS,
  basicProgram,
  collect,
  identityPort,
  prepare,
  request,
  runner,
  startInterventionRun,
} from "../../support/local-runner-fixtures";

describe("createLocalAgentRunner", () => {
  test("acknowledges cancellation separately and lets the program settle cancelled", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const target = runner({
      async execute(context) {
        await pending;
        return context.cancellation.isCancellationRequested()
          ? { status: "cancelled" }
          : { status: "completed" };
      },
    });
    const run = await target.start(request(await prepare(target), null));

    expect(
      await run.cancel({ requestedAt: "2026-07-29T14:00:01.000Z", reason: "operator-request" }),
    ).toMatchObject({ status: "acknowledged" });
    release();

    expect((await run.result()).status).toBe("cancelled");
    const events = await collect(run);
    expect(events.map((event) => event.kind)).toEqual([
      "agent.run.started",
      "agent.run.cancellation.requested",
      "agent.run.cancellation.acknowledged",
      "agent.run.cancelled",
    ]);
    expect(events[1]?.facts).toEqual({
      requestedAt: "2026-07-29T14:00:01.000Z",
      reasonProvided: true,
    });
  });

  test("rejects malformed cancellation controls before mutation or emission", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const target = runner({
      async execute() {
        await pending;
        return { status: "completed" };
      },
    });
    const run = await target.start(request(await prepare(target), null));

    expect(() =>
      run.cancel({
        requestedAt: "2026-07-29T14:00:01.000Z",
        reason: { apiKey: "secret" },
      } as never),
    ).toThrow("closed");
    release();
    await run.result();

    expect((await collect(run)).map((event) => event.kind)).toEqual([
      "agent.run.started",
      "agent.run.completed",
    ]);
  });

  test("does not mutate cancellation state unless both control events are valid", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let eventIds = 0;
    const target = runner(
      {
        async execute(context) {
          await pending;
          return {
            status: context.cancellation.isCancellationRequested() ? "cancelled" : "completed",
          };
        },
      },
      {
        identity: {
          ...identityPort(),
          newEventId: () => {
            eventIds += 1;
            return (eventIds === 3 ? "invalid-event-id" : IDS[eventIds]!) as EventId;
          },
        },
      },
    );
    const run = await target.start(request(await prepare(target), null));

    expect(() => run.cancel({ requestedAt: "2026-07-29T14:00:01.000Z" })).toThrow(
      "must mint UUIDv7 event IDs",
    );
    release();

    expect((await run.result()).status).toBe("completed");
    expect((await collect(run)).map((event) => event.kind)).toEqual([
      "agent.run.started",
      "agent.run.completed",
    ]);
  });

  test("accepts only run-bound typed interventions when enabled", async () => {
    let authentications = 0;
    const fixture = await startInterventionRun({
      verify: ({ decision: candidate }) => {
        authentications += 1;
        return { status: "authenticated", principal: candidate.actor };
      },
    });
    const { bound, release, run } = fixture;
    const wrongDigest = {
      ...bound,
      intervention: {
        ...bound.intervention,
        actionDigest: {
          ...bound.intervention.actionDigest,
          value: "B".repeat(43),
        },
      },
    } as typeof bound;

    expect((await run.intervene(wrongDigest)).status).toBe("rejected");
    expect((await run.intervene(bound)).status).toBe("accepted");
    expect((await run.intervene(decision("approve"))).status).toBe("rejected");
    expect(authentications).toBe(1);
    release();
    await run.result();

    expect(fixture.observed()).toBe(1);
    const events = await collect(run);
    const requested = events.find((event) => event.kind === "agent.run.intervention.requested");
    expect(requested?.facts).toMatchObject({
      checkpointRevision: 3,
      runId: run.identity.runId,
      requestedAt: "2026-07-29T14:00:00.000Z",
      expiresAt: "2026-07-29T15:00:00.000Z",
    });
    expect(JSON.stringify(requested)).not.toContain("reason");
  });

  test("requires an authentication port when interventions are composed", () => {
    expect(() =>
      runner(basicProgram(), {
        interventions: {} as never,
      }),
    ).toThrow("authentication port");
  });

  test("rejects forged evidence, principal mismatch and malformed verifier outcomes", async () => {
    const expectedEvidenceId = decision("approve").authentication.evidence.evidenceId;
    const evidenceFixture = await startInterventionRun({
      verify: ({ decision: candidate }) =>
        candidate.authentication.evidence.evidenceId === expectedEvidenceId
          ? { status: "authenticated", principal: candidate.actor }
          : { status: "rejected" },
    });
    const forgedEvidence = {
      ...evidenceFixture.bound,
      authentication: {
        ...evidenceFixture.bound.authentication,
        evidence: {
          ...evidenceFixture.bound.authentication.evidence,
          evidenceId: newCoreId(
            "018f0f4e-8c5b-7a91-8c3b-123456789b11",
          ) as typeof expectedEvidenceId,
        },
      },
    };
    expect((await evidenceFixture.run.intervene(forgedEvidence)).status).toBe("rejected");
    evidenceFixture.release();
    await evidenceFixture.run.result();

    for (const authentication of [
      {
        verify: () => ({
          status: "authenticated" as const,
          principal: { principalId: "operator:someone-else" as typeof principal.principalId },
        }),
      },
      { verify: () => true as never },
      {
        verify: () =>
          ({
            status: "authenticated",
            principal: { ...principal, extra: true },
          }) as never,
      },
      {
        verify: () => {
          throw new Error("verifier unavailable");
        },
      },
      {
        verify: async () => {
          throw new Error("async verifier unavailable");
        },
      },
    ] satisfies InterventionAuthenticationPort[]) {
      const fixture = await startInterventionRun(authentication);
      expect((await fixture.run.intervene(fixture.bound)).status).toBe("rejected");
      fixture.release();
      await fixture.run.result();
      expect(fixture.observed()).toBe(0);
    }
  });

  test("rechecks pending and terminal state after asynchronous authentication", async () => {
    let authenticate!: (
      result: Awaited<ReturnType<InterventionAuthenticationPort["verify"]>>,
    ) => void;
    const authentication = new Promise<
      Awaited<ReturnType<InterventionAuthenticationPort["verify"]>>
    >((resolve) => {
      authenticate = resolve;
    });
    const duplicateFixture = await startInterventionRun({
      verify: () => authentication,
    });
    const first = duplicateFixture.run.intervene(duplicateFixture.bound);
    const duplicate = duplicateFixture.run.intervene(duplicateFixture.bound);
    authenticate({ status: "authenticated", principal });
    expect((await Promise.all([first, duplicate])).map(({ status }) => status).sort()).toEqual([
      "accepted",
      "rejected",
    ]);
    duplicateFixture.release();
    await duplicateFixture.run.result();
    expect(duplicateFixture.observed()).toBe(1);

    let authenticateAfterTerminal!: (
      result: Awaited<ReturnType<InterventionAuthenticationPort["verify"]>>,
    ) => void;
    const terminalAuthentication = new Promise<
      Awaited<ReturnType<InterventionAuthenticationPort["verify"]>>
    >((resolve) => {
      authenticateAfterTerminal = resolve;
    });
    const terminalFixture = await startInterventionRun({
      verify: () => terminalAuthentication,
    });
    const late = terminalFixture.run.intervene(terminalFixture.bound);
    terminalFixture.release();
    await terminalFixture.run.result();
    authenticateAfterTerminal({ status: "authenticated", principal });
    expect((await late).status).toBe("already-terminal");
    expect(terminalFixture.observed()).toBe(0);
  });

  test("rejects an intervention that expires during asynchronous authentication", async () => {
    let currentTime = "2026-07-29T14:00:00.000Z";
    let authenticate!: (
      result: Awaited<ReturnType<InterventionAuthenticationPort["verify"]>>,
    ) => void;
    const authentication = new Promise<
      Awaited<ReturnType<InterventionAuthenticationPort["verify"]>>
    >((resolve) => {
      authenticate = resolve;
    });
    const fixture = await startInterventionRun({ verify: () => authentication }, () => currentTime);

    const outcome = fixture.run.intervene(fixture.bound);
    currentTime = "2026-07-29T15:00:00.000Z";
    authenticate({ status: "authenticated", principal });

    expect((await outcome).status).toBe("rejected");
    fixture.release();
    await fixture.run.result();
    expect(fixture.observed()).toBe(0);
  });
});
