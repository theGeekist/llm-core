import { describe, expect, test } from "bun:test";
import { isPromiseLike } from "@wpkernel/pipeline";
import {
  acceptedEventIdentityInput,
  type AcceptedProjectEvent,
  type AdmissionAuthority,
  type EventId,
  type JsonValue,
  type ProjectAdmissionReceipt,
} from "../../src/project-semantics/public.js";
import { admitProjectEvent } from "../../src/project-semantics/admission.js";
import { createInMemoryProjectJournal } from "../../src/project-semantics/journal.js";
import {
  admissionRequest,
  assertion,
  authority,
  coordinator,
  digester,
  eventId,
  evidenceId,
  observation,
  projectId,
} from "./fixtures/project.js";

const customResolved = <T>(value: T): PromiseLike<T> => ({
  then: (onFulfilled, onRejected) => Promise.resolve(value).then(onFulfilled, onRejected),
});

const customRejected = <T>(error: unknown): PromiseLike<T> => ({
  then: (onFulfilled, onRejected) => Promise.reject(error).then(onFulfilled, onRejected),
});

describe("project admission and journal", () => {
  test("preserves synchronous admission and promotes only genuine asynchronous work", async () => {
    const request = admissionRequest(1, "observation.accepted", { value: "settlement" });
    const synchronous = admitProjectEvent(request, authority(), digester);
    expect(isPromiseLike(synchronous)).toBeFalse();
    if (isPromiseLike(synchronous)) throw new Error("synchronous admission became asynchronous");
    expect(synchronous.ok).toBeTrue();

    const nativeAuthority = authority();
    const native = admitProjectEvent(
      request,
      {
        ...nativeAuthority,
        decide: (candidate, context) => Promise.resolve(nativeAuthority.decide(candidate, context)),
      },
      digester,
    );
    expect(isPromiseLike(native)).toBeTrue();
    expect((await native).ok).toBeTrue();

    const customAuthority = authority();
    const custom = admitProjectEvent(
      request,
      {
        ...customAuthority,
        decide: (candidate, context) => {
          const decision = customAuthority.decide(candidate, context);
          if (isPromiseLike(decision)) throw new Error("fixture authority became asynchronous");
          return customResolved(decision);
        },
      },
      digester,
    );
    expect(isPromiseLike(custom)).toBeTrue();
    expect((await custom).ok).toBeTrue();
  });

  test("fails closed on rejected, hostile and malformed authority outputs", async () => {
    const request = admissionRequest(1, "observation.accepted", { value: "authority" });
    const validAuthority = authority();
    const validDecision = validAuthority.decide(request, {
      currentEvents: [],
      latestAdmittedAt: null,
    });
    if (isPromiseLike(validDecision) || validDecision === null) {
      throw new Error("fixture authority must settle synchronously");
    }
    const hostileAccessor = Object.defineProperty({ ...validDecision }, "then", {
      get: () => {
        throw new Error("hostile then accessor");
      },
    });
    const hostileProxy = new Proxy(validDecision, {
      getOwnPropertyDescriptor: () => {
        throw new Error("hostile descriptor trap");
      },
    });
    const authorities: readonly AdmissionAuthority[] = [
      { ...validAuthority, decide: () => Promise.reject(new Error("native rejection")) },
      {
        ...validAuthority,
        decide: () => customRejected(new Error("thenable rejection")),
      },
      { ...validAuthority, decide: () => hostileAccessor as never },
      { ...validAuthority, decide: () => hostileProxy as never },
      { ...validAuthority, decide: () => undefined as never },
      { ...validAuthority, decide: () => "true" as never },
      new Proxy(validAuthority, {
        get: (target, property, receiver) => {
          if (property === "decide") throw new Error("hostile decide accessor");
          return Reflect.get(target, property, receiver);
        },
      }),
    ];

    for (const candidate of authorities) {
      const result = await admitProjectEvent(request, candidate, digester);
      expect(result.ok).toBeFalse();
    }
  });

  test("rejects incomplete, hostile and unauthorised observations before admission", async () => {
    const incomplete = admissionRequest(1, "observation.accepted", { status: "observed" });
    const noEvidence = {
      ...incomplete,
      observation: { ...incomplete.observation, evidence: [] },
    };
    expect((await admitProjectEvent(noEvidence, authority(), digester)).ok).toBe(false);
    expect((await admitProjectEvent(incomplete, authority(false), digester)).ok).toBe(false);

    let getterCalls = 0;
    const hostile: Record<string, unknown> = { ...incomplete };
    Object.defineProperty(hostile, "observation", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return incomplete.observation;
      },
    });
    expect((await admitProjectEvent(hostile, authority(), digester)).ok).toBe(false);
    expect(getterCalls).toBe(0);
  });

  test("creates immutable content-bound events", async () => {
    const result = await admitProjectEvent(
      admissionRequest(1, "decision.accepted", { decision: "use-admission" }),
      authority(),
      digester,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("admission failed");
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.payload)).toBe(true);
    expect(result.value.payloadDigest.value).toHaveLength(64);
    expect(result.value.eventDigest.value).toHaveLength(64);
  });

  test("rejects a self-digested event that was not minted by admission", async () => {
    const journal = createInMemoryProjectJournal(digester);
    const admitted = await admitProjectEvent(
      admissionRequest(1, "observation.accepted", { value: "legitimate" }),
      authority(),
      digester,
    );
    if (!admitted.ok) throw new Error("fixture admission failed");
    const forgedBase: AcceptedProjectEvent = {
      ...admitted.value,
      sourceAuthority: { authorityId: "plugin.forged", kind: "plugin" },
      admission: {
        ...admitted.value.admission,
        authority: { authorityId: "plugin.forged", kind: "plugin" },
      },
      evidence: [],
      payload: { manufactured: "project-truth" },
    };
    const payloadDigest = await digester.digest(forgedBase.payload);
    const { eventDigest: ignoredEventDigest, ...identity } = { ...forgedBase, payloadDigest };
    void ignoredEventDigest;
    const forged: AcceptedProjectEvent = {
      ...identity,
      eventDigest: await digester.digest(acceptedEventIdentityInput(identity)),
    };

    const result = await journal.append(forged as ProjectAdmissionReceipt);
    expect(result).toEqual({
      ok: false,
      diagnostics: [{ code: "invalid-admission", reasonCode: "admission-receipt-required" }],
    });
    expect((await journal.checkpoint(projectId)).position).toBe(0);
  });

  test("serialises append, rejects causal gaps and treats duplicate delivery idempotently", async () => {
    const journal = createInMemoryProjectJournal(digester);
    const first = await admitProjectEvent(
      admissionRequest(1, "observation.accepted", { value: 1 }),
      authority(),
      digester,
    );
    if (!first.ok) throw new Error("fixture admission failed");
    const causalGap = await admitProjectEvent(
      admissionRequest(2, "correction.accepted", { value: 2 }, eventId(9)),
      authority(),
      digester,
    );
    if (!causalGap.ok) throw new Error("fixture admission failed");
    expect((await journal.append(causalGap.value)).ok).toBe(false);
    const appended = await journal.append(first.value);
    expect(appended.ok).toBe(true);
    if (!appended.ok) throw new Error("append failed");
    expect(appended.value.disposition).toBe("appended");
    const duplicate = await journal.append(first.value);
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) throw new Error("duplicate append failed");
    expect(duplicate.value.disposition).toBe("already-present");

    const conflicting = await admitProjectEvent(
      {
        ...admissionRequest(3, "observation.accepted", { value: 3 }),
        eventId: first.value.eventId,
      },
      authority(),
      digester,
    );
    if (!conflicting.ok) throw new Error("fixture admission failed");
    expect((await journal.append(conflicting.value)).ok).toBe(false);
    expect((await journal.read(projectId)).map(({ eventId }) => eventId)).toEqual([
      first.value.eventId,
    ]);
  });

  test("canonical identity ignores input key insertion order", async () => {
    const left = admissionRequest(1, "observation.accepted", { alpha: 1, beta: 2 });
    const right = {
      ...left,
      observation: observation(1, "observation.accepted", { beta: 2, alpha: 1 }),
    };
    const [leftResult, rightResult] = await Promise.all([
      admitProjectEvent(left, authority(), digester),
      admitProjectEvent(right, authority(), digester),
    ]);
    if (!leftResult.ok || !rightResult.ok) throw new Error("fixture admission failed");
    expect(leftResult.value.eventDigest).toEqual(rightResult.value.eventDigest);
    expect(leftResult.value.evidence).toEqual([evidenceId(1)]);
  });

  test("holds canonical identity and append-only prefix properties across a deterministic sweep", async () => {
    const journal = createInMemoryProjectJournal(digester);
    const accepted: EventId[] = [];
    for (let sequence = 1; sequence <= 24; sequence += 1) {
      const ascending = Object.fromEntries(
        Array.from({ length: 5 }, (_, index) => [`field-${index}`, sequence * 10 + index]),
      );
      const descending = Object.fromEntries(Object.entries(ascending).reverse());
      const [left, right] = await Promise.all([
        admitProjectEvent(
          admissionRequest(sequence, "observation.accepted", ascending),
          authority(),
          digester,
        ),
        admitProjectEvent(
          admissionRequest(sequence, "observation.accepted", descending),
          authority(),
          digester,
        ),
      ]);
      if (!left.ok || !right.ok) throw new Error("property fixture admission failed");
      expect(left.value.eventDigest).toEqual(right.value.eventDigest);
      const before = await journal.read(projectId);
      accepted.push(left.value.eventId);
      const append = await journal.append(left.value);
      expect(append.ok).toBe(true);
      const after = await journal.read(projectId);
      expect(after.slice(0, before.length)).toEqual([...before]);
      expect(after.map(({ eventId: id }) => id)).toEqual(accepted);
      expect(Object.isFrozen(after)).toBe(true);
    }
  });

  test("fails closed on invalid authority, duplicate evidence and invalid causal identity", async () => {
    const request = admissionRequest(1, "observation.accepted", { value: 1 });
    const invalidAuthority = {
      ...request,
      observation: {
        ...request.observation,
        sourceAuthority: { ...request.observation.sourceAuthority, kind: "root" },
      },
    };
    const duplicateEvidence = {
      ...request,
      observation: {
        ...request.observation,
        evidence: [evidenceId(1), evidenceId(1)],
      },
    };
    const invalidCausation = {
      ...request,
      observation: { ...request.observation, causationId: "not-an-event-id" },
    };
    expect((await admitProjectEvent(invalidAuthority, authority(), digester)).ok).toBe(false);
    expect((await admitProjectEvent(duplicateEvidence, authority(), digester)).ok).toBe(false);
    expect((await admitProjectEvent(invalidCausation, authority(), digester)).ok).toBe(false);
  });

  test("accepts only authority-issued closed admission decisions", async () => {
    const request = admissionRequest(1, "observation.accepted", { value: 1 });
    const callerAuthored = {
      ...request,
      decision: {
        decisionId: "caller-decision",
        authority: coordinator,
        policyId: "caller-policy",
        decidedAt: "2026-08-18T00:01:01Z",
      },
    };
    expect((await admitProjectEvent(callerAuthored, authority(), digester)).ok).toBe(false);

    const malformedAuthority = {
      authorityId: coordinator.authorityId,
      decide: () => ({
        decisionId: "authority-decision",
        authority: coordinator,
        policyId: "project-admission/v1",
        decidedAt: "2026-08-18T00:01:01Z",
        unboundAuditField: true,
      }),
    };
    expect((await admitProjectEvent(request, malformedAuthority, digester)).ok).toBe(false);
  });

  test("closes optional authority and provenance fields against malformed and unknown input", async () => {
    const request = admissionRequest(1, "observation.accepted", { value: 1 });
    const cases = [
      {
        ...request,
        observation: {
          ...request.observation,
          sourceAuthority: { ...coordinator, delegationId: "contains whitespace" },
        },
      },
      {
        ...request,
        observation: {
          ...request.observation,
          sourceAuthority: { ...coordinator, unexpected: true },
        },
      },
      {
        ...request,
        observation: {
          ...request.observation,
          provenance: { ...request.observation.provenance, revision: "contains whitespace" },
        },
      },
      {
        ...request,
        observation: {
          ...request.observation,
          provenance: {
            ...request.observation.provenance,
            contentDigest: { algorithm: "sha-256", value: "a".repeat(64), extra: true },
          },
        },
      },
    ];
    for (const candidate of cases) {
      expect((await admitProjectEvent(candidate, authority(), digester)).ok).toBe(false);
    }
  });

  test("rejects malformed assertion and retraction events before durable append", async () => {
    const journal = createInMemoryProjectJournal(digester);
    const nonRecordRecorded = await admitProjectEvent(
      admissionRequest(1, "assertions.recorded", []),
      authority(),
      digester,
    );
    if (!nonRecordRecorded.ok) throw new Error("fixture admission failed");
    expect((await journal.append(nonRecordRecorded.value)).ok).toBe(false);
    expect(await journal.read(projectId)).toEqual([]);

    const seed = await admitProjectEvent(
      admissionRequest(2, "observation.accepted", { value: "causal-seed" }),
      authority(),
      digester,
    );
    if (!seed.ok) throw new Error("fixture admission failed");
    expect((await journal.append(seed.value)).ok).toBe(true);

    const nonRecordRetraction = await admitProjectEvent(
      admissionRequest(3, "assertions.retracted", null, seed.value.eventId),
      authority(),
      digester,
    );
    if (!nonRecordRetraction.ok) throw new Error("fixture admission failed");
    expect((await journal.append(nonRecordRetraction.value)).ok).toBe(false);
    expect((await journal.read(projectId)).map(({ eventId: id }) => id)).toEqual([
      seed.value.eventId,
    ]);

    const malformed = await admitProjectEvent(
      admissionRequest(4, "assertions.recorded", {
        assertions: [
          {
            ...(assertion("task-type", "task-a", "entity.type", "task") as {
              [key: string]: JsonValue;
            }),
            extra: true,
          },
        ],
      }),
      authority(),
      digester,
    );
    if (!malformed.ok) throw new Error("fixture admission failed");
    expect((await journal.append(malformed.value)).ok).toBe(false);
    expect((await journal.read(projectId)).map(({ eventId: id }) => id)).toEqual([
      seed.value.eventId,
    ]);

    const recorded = await admitProjectEvent(
      admissionRequest(5, "assertions.recorded", {
        assertions: [assertion("task-type", "task-a", "entity.type", "task", 5)],
      }),
      authority(),
      digester,
    );
    if (!recorded.ok) throw new Error("fixture admission failed");
    expect((await journal.append(recorded.value)).ok).toBe(true);

    const invalidRetraction = await admitProjectEvent(
      admissionRequest(
        6,
        "assertions.retracted",
        { assertionIds: ["assertion-does-not-exist"] },
        recorded.value.eventId,
      ),
      authority(),
      digester,
    );
    if (!invalidRetraction.ok) throw new Error("fixture admission failed");
    expect((await journal.append(invalidRetraction.value)).ok).toBe(false);
    expect((await journal.read(projectId)).map(({ eventId: id }) => id)).toEqual([
      seed.value.eventId,
      recorded.value.eventId,
    ]);
  });

  test("enforces non-decreasing admitted time per project", async () => {
    const journal = createInMemoryProjectJournal(digester);
    const timedAuthority = (decidedAt: string) => ({
      authorityId: coordinator.authorityId,
      decide: () => ({
        decisionId: `decision-${decidedAt}`,
        authority: coordinator,
        policyId: "project-admission/v1",
        decidedAt,
      }),
    });
    const first = await admitProjectEvent(
      admissionRequest(1, "observation.accepted", { value: 1 }),
      timedAuthority("2026-08-18T00:10:00Z"),
      digester,
    );
    const regressed = await admitProjectEvent(
      admissionRequest(2, "observation.accepted", { value: 2 }),
      timedAuthority("2026-08-18T00:02:00Z"),
      digester,
    );
    if (!first.ok || !regressed.ok) throw new Error("fixture admission failed");
    expect((await journal.append(first.value)).ok).toBe(true);
    expect((await journal.append(regressed.value)).ok).toBe(false);
    expect((await journal.read(projectId)).map(({ eventId: id }) => id)).toEqual([
      first.value.eventId,
    ]);
  });
});
