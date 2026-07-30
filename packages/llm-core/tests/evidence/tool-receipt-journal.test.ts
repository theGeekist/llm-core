import { describe, expect, it } from "bun:test";
import { contractVersion, coreId, externalId, secretRef } from "../../src/contracts/public";
import type { EvidenceId, EventId, RunId, TenantId, ToolCallId } from "../../src/contracts/public";
import {
  actionDigestsEqual,
  classifyExistingReservation,
  isToolReceiptTransitionAllowed,
  redactedNativeExtensions,
  reservationKeysEqual,
} from "../../src/features/evidence/public";
import type {
  AppendToolReceiptTransition,
  AppendToolReceiptTransitionResult,
  EffectDisposition,
  ExecutionEvent,
  LoadToolReceipt,
  LookupToolReceiptByIdempotency,
  ReserveToolReceipt,
  ReserveToolReceiptResult,
  ToolExecutionReceipt,
  ToolReceiptJournal,
  ToolReceiptState,
  ToolReceiptTransition,
} from "../../src/features/evidence/public";
import { toolId } from "../../src/features/tooling/public";
import type { ActionDigest } from "../../src/features/tooling/public";

const RECEIPT_ID = coreId<EvidenceId>("01890f3e-3e30-7cc4-98c8-4d1f3c35ca10");
const RUN_ID = coreId<RunId>("01890f3e-3e30-7cc4-98c8-4d1f3c35ca11");
const TOOL_CALL_ID = coreId<ToolCallId>("01890f3e-3e30-7cc4-98c8-4d1f3c35ca12");
const TENANT_ID = externalId<TenantId>("tenant:example");

const digest = (value: string): ActionDigest =>
  ({
    algorithm: "hmac-sha-256",
    keyRef: secretRef("vault:tool-action-key"),
    value,
  }) as ActionDigest;

const DIGEST_A = digest("a".repeat(43));
const DIGEST_B = digest("b".repeat(43));

const reservation = (overrides: Partial<ReserveToolReceipt> = {}): ReserveToolReceipt => ({
  receiptId: RECEIPT_ID,
  key: {
    securityDomain: "tenant:example",
    tenantId: TENANT_ID,
    toolId: toolId("example.email.send"),
    toolVersion: contractVersion("1.0.0"),
    idempotencyKey: "send-message-42",
  },
  actionDigest: DIGEST_A,
  effectClass: "external-write",
  runId: RUN_ID,
  toolCallId: TOOL_CALL_ID,
  redaction: {
    kind: "evidence-only",
    categories: ["arguments", "result", "credentials", "native-payload"],
  },
  ...overrides,
});

const keyOf = (request: ReserveToolReceipt | LookupToolReceiptByIdempotency): string => {
  const { key } = request;
  return [
    key.securityDomain,
    key.tenantId ?? "",
    key.toolId,
    key.toolVersion,
    key.idempotencyKey,
  ].join("\u0000");
};

class MemoryToolReceiptJournal implements ToolReceiptJournal {
  readonly #byId = new Map<EvidenceId, ToolExecutionReceipt>();
  readonly #byKey = new Map<string, EvidenceId>();

  async reserve(request: ReserveToolReceipt): Promise<ReserveToolReceiptResult> {
    const existingId = this.#byKey.get(keyOf(request));
    if (existingId) {
      const existing = this.#byId.get(existingId)!;
      if (classifyExistingReservation(existing, request) === "existing") {
        return { kind: "existing", receipt: existing, durable: "acknowledged" };
      }
      return {
        kind: "conflict",
        existingReceiptId: existing.receiptId,
        existingDigest: existing.actionDigest,
        requestedDigest: request.actionDigest,
      };
    }

    const receipt: ToolExecutionReceipt = {
      ...request,
      revision: 0,
      state: "reserved",
      effectDisposition: "not-started",
      history: [],
    };
    this.#byId.set(receipt.receiptId, receipt);
    this.#byKey.set(keyOf(request), receipt.receiptId);
    return { kind: "created", receipt, durable: "acknowledged" };
  }

  async append(request: AppendToolReceiptTransition): Promise<AppendToolReceiptTransitionResult> {
    const current = this.#byId.get(request.receiptId);
    if (!current) {
      return { kind: "not-found", receiptId: request.receiptId };
    }
    if (current.revision !== request.expectedRevision) {
      return {
        kind: "revision-conflict",
        receipt: current,
        expectedRevision: request.expectedRevision,
        actualRevision: current.revision,
      };
    }
    if (
      request.transition.from !== current.state ||
      !isToolReceiptTransitionAllowed(request.transition.from, request.transition.to)
    ) {
      throw new TypeError("Invalid receipt lifecycle transition.");
    }

    const entry = {
      ...request.transition,
      revision: current.revision + 1,
      durable: "acknowledged" as const,
    };
    const receipt: ToolExecutionReceipt = {
      ...current,
      revision: entry.revision,
      state: entry.to,
      effectDisposition: entry.effectDisposition,
      policy: entry.policy ?? current.policy,
      approval: entry.approval ?? current.approval,
      cancellation: entry.cancellation ?? current.cancellation,
      approvalRequestedAt: entry.approvalRequestedAt ?? current.approvalRequestedAt,
      approvalExpiresAt: entry.approvalExpiresAt ?? current.approvalExpiresAt,
      approvalRequiredApprover: entry.approvalRequiredApprover ?? current.approvalRequiredApprover,
      history: [...current.history, entry],
    };
    this.#byId.set(receipt.receiptId, receipt);
    return { kind: "appended", receipt, entry, durable: "acknowledged" };
  }

  async load(request: LoadToolReceipt): Promise<ToolExecutionReceipt | null> {
    return this.#byId.get(request.receiptId) ?? null;
  }

  async loadByIdempotency(
    request: LookupToolReceiptByIdempotency,
  ): Promise<ToolExecutionReceipt | null> {
    const receiptId = this.#byKey.get(keyOf(request));
    return receiptId ? (this.#byId.get(receiptId) ?? null) : null;
  }
}

const eventId = (ordinal: number): EventId =>
  coreId<EventId>(`01890f3e-3e30-7cc4-98c8-${(0x4d1f3c35ca20 + ordinal).toString(16)}`);

const transition = (
  ordinal: number,
  [from, to]: [ToolReceiptState, ToolReceiptState],
  effectDisposition: EffectDisposition,
): ToolReceiptTransition => ({
  transitionId: eventId(ordinal),
  from,
  to,
  recordedAt: `2026-07-29T00:00:${String(ordinal).padStart(2, "0")}.000Z`,
  effectDisposition,
  redaction: { kind: "not-required" },
});

const appendSequence = async (
  journal: ToolReceiptJournal,
  receiptId: EvidenceId,
  sequence: Array<[ToolReceiptState, ToolReceiptState, EffectDisposition]>,
): Promise<ToolExecutionReceipt> => {
  let revision = 0;
  let receipt: ToolExecutionReceipt | null = null;
  for (const [from, to, disposition] of sequence) {
    const result = await journal.append({
      receiptId,
      expectedRevision: revision,
      transition: transition(revision + 1, [from, to], disposition),
    });
    expect(result.kind).toBe("appended");
    if (result.kind !== "appended") {
      throw new Error("Expected an appended transition.");
    }
    expect(result.durable).toBe("acknowledged");
    receipt = result.receipt;
    revision = result.receipt.revision;
  }
  return receipt!;
};

describe("ToolReceiptJournal contract", () => {
  it("returns the existing reservation for the same digest and a conflict for another digest", async () => {
    const journal = new MemoryToolReceiptJournal();
    const created = await journal.reserve(reservation());
    const existing = await journal.reserve(
      reservation({
        receiptId: coreId<EvidenceId>("01890f3e-3e30-7cc4-98c8-4d1f3c35ca13"),
      }),
    );
    const conflict = await journal.reserve(
      reservation({
        receiptId: coreId<EvidenceId>("01890f3e-3e30-7cc4-98c8-4d1f3c35ca14"),
        actionDigest: DIGEST_B,
      }),
    );

    expect(created.kind).toBe("created");
    expect(existing.kind).toBe("existing");
    expect(conflict.kind).toBe("conflict");
    expect(actionDigestsEqual(DIGEST_A, digest("a".repeat(43)))).toBe(true);
    expect(actionDigestsEqual(DIGEST_A, DIGEST_B)).toBe(false);
    expect(reservationKeysEqual(reservation().key, reservation().key)).toBe(true);
    if (created.kind === "created") {
      expect(
        classifyExistingReservation(
          created.receipt,
          reservation({
            key: {
              ...reservation().key,
              securityDomain: "tenant:other",
            },
          }),
        ),
      ).toBe("conflict");
    }
    expect(await journal.loadByIdempotency({ key: reservation().key })).not.toBeNull();
  });

  it("uses optimistic revisions and acknowledges a transition only after append", async () => {
    const journal = new MemoryToolReceiptJournal();
    await journal.reserve(reservation());

    const appended = await journal.append({
      receiptId: RECEIPT_ID,
      expectedRevision: 0,
      transition: transition(1, ["reserved", "awaiting_policy"], "not-started"),
    });
    const stale = await journal.append({
      receiptId: RECEIPT_ID,
      expectedRevision: 0,
      transition: transition(2, ["reserved", "awaiting_policy"], "not-started"),
    });

    expect(appended.kind).toBe("appended");
    if (appended.kind === "appended") {
      expect(appended.durable).toBe("acknowledged");
      expect(appended.entry.revision).toBe(1);
      expect(appended.receipt.history).toEqual([appended.entry]);
    }
    expect(stale).toMatchObject({
      kind: "revision-conflict",
      expectedRevision: 0,
      actualRevision: 1,
    });
  });

  it("models cancellation before start and uncertainty after start", async () => {
    const cancelledJournal = new MemoryToolReceiptJournal();
    await cancelledJournal.reserve(reservation());
    const cancelled = await appendSequence(cancelledJournal, RECEIPT_ID, [
      ["reserved", "awaiting_policy", "not-started"],
      ["awaiting_policy", "ready", "not-started"],
      ["ready", "cancelled_before_start", "not-started"],
    ]);
    expect(cancelled.state).toBe("cancelled_before_start");

    const uncertainId = coreId<EvidenceId>("01890f3e-3e30-7cc4-98c8-4d1f3c35ca15");
    const uncertainJournal = new MemoryToolReceiptJournal();
    await uncertainJournal.reserve(
      reservation({
        receiptId: uncertainId,
        key: { ...reservation().key, idempotencyKey: "send-message-43" },
      }),
    );
    const uncertain = await appendSequence(uncertainJournal, uncertainId, [
      ["reserved", "awaiting_policy", "not-started"],
      ["awaiting_policy", "ready", "not-started"],
      ["ready", "started", "unknown"],
      ["started", "indeterminate", "unknown"],
      ["indeterminate", "reconciliation_required", "unknown"],
    ]);
    expect(uncertain.state).toBe("reconciliation_required");
    expect(isToolReceiptTransitionAllowed("started", "cancelled_before_start")).toBe(false);
  });

  it("records compensation as an explicit append-derived lifecycle", async () => {
    const journal = new MemoryToolReceiptJournal();
    await journal.reserve(reservation());
    const compensated = await appendSequence(journal, RECEIPT_ID, [
      ["reserved", "awaiting_policy", "not-started"],
      ["awaiting_policy", "ready", "not-started"],
      ["ready", "started", "unknown"],
      ["started", "succeeded", "applied"],
      ["succeeded", "compensation_required", "applied"],
      ["compensation_required", "compensating", "partial"],
      ["compensating", "compensated", "compensated"],
    ]);

    expect(compensated.state).toBe("compensated");
    expect(compensated.effectDisposition).toBe("compensated");
    expect(compensated.history).toHaveLength(7);
  });

  it("keeps raw arguments, results, credentials and native payloads out of receipts and events", async () => {
    const secret = "super-secret-token";
    const rawArguments = { authorization: secret };
    const rawResult = { providerPayload: secret };
    const journal = new MemoryToolReceiptJournal();
    const result = await journal.reserve(reservation());
    if (result.kind === "conflict") {
      throw new Error("Expected a created receipt.");
    }

    const event: ExecutionEvent = {
      eventId: eventId(9),
      kind: "tool.receipt.reserved",
      occurredAt: "2026-07-29T00:00:09.000Z",
      sequence: 1,
      runId: RUN_ID,
      toolCallId: TOOL_CALL_ID,
      facts: {
        receiptId: result.receipt.receiptId,
        receiptRevision: result.receipt.revision,
        receiptState: result.receipt.state,
        effectDisposition: result.receipt.effectDisposition,
        actionDigest: result.receipt.actionDigest,
      },
      redaction: result.receipt.redaction,
    };
    const serialized = JSON.stringify({ receipt: result.receipt, event });

    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(JSON.stringify(rawArguments));
    expect(serialized).not.toContain(JSON.stringify(rawResult));
    expect(serialized).not.toContain('"authorization":');
    expect(serialized).not.toContain('"result":');
    expect(serialized).not.toContain('"providerPayload":');
    expect(() =>
      redactedNativeExtensions({
        "com.example.audit": { credentials: secret },
      }),
    ).toThrow("cannot contain sensitive or raw payload fields");
    const safeExtensions = redactedNativeExtensions({
      "com.example.audit": { classification: "restricted" },
    });
    expect(JSON.stringify(safeExtensions)).toBe(
      '{"com.example.audit":{"classification":"restricted"}}',
    );
    const mutableExtensions = {
      "com.example.audit": { classification: "restricted" },
    };
    const registeredExtensions = redactedNativeExtensions(mutableExtensions);
    mutableExtensions["com.example.audit"] = { classification: secret };
    expect(registeredExtensions["com.example.audit"]).toEqual({
      classification: "restricted",
    });
    expect(Object.isFrozen(registeredExtensions)).toBe(true);
    expect(Object.isFrozen(registeredExtensions["com.example.audit"])).toBe(true);
    expect(
      () => ((registeredExtensions["com.example.audit"] as Record<string, unknown>).token = secret),
    ).toThrow(TypeError);
  });
});
