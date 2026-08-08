import { describe, expect, it } from "bun:test";
import { type EvidenceId, type ResourceId, coreId, digest, schemaRef } from "#contracts";
import { executeControlledTool } from "../../../src/tools/runtime";
import { reconcileControlledToolReceipt } from "../../../src/application/tool-execution/public";
import { CALL_ID, RUN_ID, baseInput, facts, id, MemoryJournal } from "./execute-fixtures";

describe("controlled tool execution", () => {
  it("reconciles a stale indeterminate receipt from authoritative evidence without rerunning", async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    const initial = await executeControlledTool(
      baseInput(journal, () => {
        executions += 1;
        throw new Error("provider outcome unavailable");
      }),
    );
    if (!("receipt" in initial)) throw new Error("Expected a durable receipt.");
    const evidence = {
      evidenceId: coreId<EvidenceId>(id(98)),
      kind: "execution-receipt" as const,
      content: {
        resourceId: coreId<ResourceId>(id(99)),
        mediaType: "application/json; charset=utf-8",
        byteLength: 2,
        digest: digest("e".repeat(64)),
      },
      schema: schemaRef({
        schemaId: "https://schemas.example.test/tool-reconciliation",
        version: "1.0.0",
        digest: digest("f".repeat(64)),
      }),
    };
    const providerResult = {
      kind: "known" as const,
      disposition: "applied" as const,
      observedAt: "2026-07-29T00:02:00.000Z",
      evidence,
    };
    journal.now = "2026-07-29T00:02:00.000Z";
    const recovery = await reconcileControlledToolReceipt({
      receiptId: initial.receipt.receiptId,
      journal,
      receiptOwner: { ownerId: "worker:recovery" },
      receiptLeaseDurationMs: 60_000,
      facts: { ...facts(), now: () => "2026-07-29T00:02:00.000Z" },
      reconciler: {
        reconcile: () => Promise.resolve(providerResult),
      },
    });
    providerResult.evidence.content.mediaType = "text/plain";
    providerResult.evidence.schema.schemaId = "https://attacker.example.test/replaced";

    expect(recovery.status).toBe("reconciled");
    expect("receipt" in recovery && recovery.receipt.state).toBe("succeeded");
    expect("receipt" in recovery && recovery.receipt.effectDisposition).toBe("applied");
    expect("receipt" in recovery && recovery.receipt.reconciliation?.result).toMatchObject({
      kind: "known",
      disposition: "applied",
      evidence: {
        content: { mediaType: "application/json; charset=utf-8" },
        schema: { schemaId: "https://schemas.example.test/tool-reconciliation" },
      },
    });
    expect(executions).toBe(1);
  });

  it("keeps a fresh ambiguous receipt fenced and requires explicit unresolved recovery", async () => {
    const journal = new MemoryJournal();
    const initial = await executeControlledTool(
      baseInput(journal, () => {
        throw new Error("provider outcome unavailable");
      }),
    );
    if (!("receipt" in initial)) throw new Error("Expected a durable receipt.");
    let reconciliations = 0;
    const held = await reconcileControlledToolReceipt({
      receiptId: initial.receipt.receiptId,
      journal,
      receiptOwner: { ownerId: "worker:recovery" },
      receiptLeaseDurationMs: 60_000,
      facts: facts(),
      reconciler: {
        reconcile: () => {
          reconciliations += 1;
          return Promise.resolve({
            kind: "unresolved" as const,
            observedAt: "2026-07-29T00:00:00.000Z",
            reasonCode: "not-used",
          });
        },
      },
    });
    journal.now = "2026-07-29T00:02:00.000Z";
    const unresolved = await reconcileControlledToolReceipt({
      receiptId: initial.receipt.receiptId,
      journal,
      receiptOwner: { ownerId: "worker:recovery" },
      receiptLeaseDurationMs: 60_000,
      facts: { ...facts(), now: () => "2026-07-29T00:02:00.000Z" },
      reconciler: {
        reconcile: () => {
          reconciliations += 1;
          return Promise.resolve({
            kind: "unresolved" as const,
            observedAt: "2026-07-29T00:02:00.000Z",
            reasonCode: "provider-outcome-unknown",
          });
        },
      },
    });

    expect(held.status).toBe("held");
    expect(unresolved.status).toBe("reconciliation-required");
    expect("receipt" in unresolved && unresolved.receipt.state).toBe("reconciliation_required");
    expect(reconciliations).toBe(1);
  });

  it("rejects malformed reconciliation evidence and secret-bearing reason text", async () => {
    const journal = new MemoryJournal();
    const initial = await executeControlledTool(
      baseInput(journal, () => {
        throw new Error("provider outcome unavailable");
      }),
    );
    if (!("receipt" in initial)) throw new Error("Expected a durable receipt.");
    journal.now = "2026-07-29T00:02:00.000Z";
    const outcome = await reconcileControlledToolReceipt({
      receiptId: initial.receipt.receiptId,
      journal,
      receiptOwner: { ownerId: "worker:recovery" },
      receiptLeaseDurationMs: 60_000,
      facts: { ...facts(), now: () => "2026-07-29T00:02:00.000Z" },
      reconciler: {
        reconcile: () =>
          Promise.resolve({
            kind: "known",
            disposition: "applied",
            observedAt: "2026-07-29T00:02:00.000Z",
            evidence: {},
            reasonCode: "provider-secret-token",
          } as never),
      },
    });

    expect(outcome.status).toBe("reconciliation-required");
    expect("receipt" in outcome && outcome.receipt.reconciliation?.result).toEqual({
      kind: "unresolved",
      observedAt: "2026-07-29T00:02:00.000Z",
      reasonCode: "reconciliation-result-invalid",
    });
    expect(JSON.stringify(outcome)).not.toContain("provider-secret-token");
  });

  it("rejects a secret-bearing unresolved reason instead of persisting provider text", async () => {
    const journal = new MemoryJournal();
    const initial = await executeControlledTool(
      baseInput(journal, () => {
        throw new Error("provider outcome unavailable");
      }),
    );
    if (!("receipt" in initial)) throw new Error("Expected a durable receipt.");
    journal.now = "2026-07-29T00:02:00.000Z";
    const outcome = await reconcileControlledToolReceipt({
      receiptId: initial.receipt.receiptId,
      journal,
      receiptOwner: { ownerId: "worker:recovery" },
      receiptLeaseDurationMs: 60_000,
      facts: { ...facts(), now: () => "2026-07-29T00:02:00.000Z" },
      reconciler: {
        reconcile: () =>
          Promise.resolve({
            kind: "unresolved",
            observedAt: "2026-07-29T00:02:00.000Z",
            reasonCode: "provider-secret-token",
          } as never),
      },
    });

    expect(outcome.status).toBe("reconciliation-required");
    expect("receipt" in outcome && outcome.receipt.reconciliation?.result).toEqual({
      kind: "unresolved",
      observedAt: "2026-07-29T00:02:00.000Z",
      reasonCode: "reconciliation-result-invalid",
    });
    expect(JSON.stringify(outcome)).not.toContain("provider-secret-token");
  });

  it("turns hostile proxy and accessor reconciliation values into generic unresolved results", async () => {
    const hostileValues: unknown[] = [
      new Proxy(
        {},
        {
          getPrototypeOf: () => {
            throw new Error("provider-secret-from-proxy");
          },
        },
      ),
      Object.defineProperty(
        {
          observedAt: "2026-07-29T00:02:00.000Z",
          reasonCode: "provider-outcome-unknown",
        },
        "kind",
        {
          enumerable: true,
          get: () => {
            throw new Error("provider-secret-from-accessor");
          },
        },
      ),
      {
        kind: "known",
        disposition: {
          [Symbol.toPrimitive]: () => {
            throw new Error("provider-secret-from-coercion");
          },
        },
        observedAt: "2026-07-29T00:02:00.000Z",
        evidence: {},
      },
      {
        kind: "unresolved",
        observedAt: "2026-07-29T00:02:00.000Z",
        reasonCode: "provider-outcome-unknown",
        evidence: undefined,
      },
    ];

    for (const hostileValue of hostileValues) {
      const journal = new MemoryJournal();
      const initial = await executeControlledTool(
        baseInput(journal, () => {
          throw new Error("provider outcome unavailable");
        }),
      );
      if (!("receipt" in initial)) throw new Error("Expected a durable receipt.");
      journal.now = "2026-07-29T00:02:00.000Z";
      const outcome = await reconcileControlledToolReceipt({
        receiptId: initial.receipt.receiptId,
        journal,
        receiptOwner: { ownerId: "worker:recovery" },
        receiptLeaseDurationMs: 60_000,
        facts: { ...facts(), now: () => "2026-07-29T00:02:00.000Z" },
        reconciler: { reconcile: () => Promise.resolve(hostileValue as never) },
      });

      expect(outcome.status).toBe("reconciliation-required");
      expect("receipt" in outcome && outcome.receipt.reconciliation?.result).toEqual({
        kind: "unresolved",
        observedAt: "2026-07-29T00:02:00.000Z",
        reasonCode: "reconciliation-result-invalid",
      });
      expect(JSON.stringify(outcome)).not.toContain("provider-secret");
    }
  });

  it("preserves a post-start cancellation request through unresolved recovery", async () => {
    const journal = new MemoryJournal();
    let requested = false;
    const handlers = new Set<() => void>();
    const control = {
      isCancellationRequested: () => requested,
      onCancellationRequested: (handler: () => void) => {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
    };
    const initial = await executeControlledTool({
      ...baseInput(journal, () => {
        requested = true;
        handlers.forEach((handler) => handler());
        throw new Error("provider outcome unavailable");
      }),
      executionControl: control,
    });
    if (!("receipt" in initial)) throw new Error("Expected a durable receipt.");
    journal.now = "2026-07-29T00:02:00.000Z";
    const recovered = await reconcileControlledToolReceipt({
      receiptId: initial.receipt.receiptId,
      journal,
      receiptOwner: { ownerId: "worker:recovery" },
      receiptLeaseDurationMs: 60_000,
      facts: { ...facts(), now: () => "2026-07-29T00:02:00.000Z" },
      reconciler: {
        reconcile: () =>
          Promise.resolve({
            kind: "unresolved" as const,
            observedAt: "2026-07-29T00:02:00.000Z",
            reasonCode: "provider-outcome-unknown",
          }),
      },
    });

    expect(recovered.status).toBe("reconciliation-required");
    expect("receipt" in recovered && recovered.receipt.cancellation).toMatchObject({
      runId: RUN_ID,
      toolCallId: CALL_ID,
    });
    expect("receipt" in recovered && recovered.receipt.effectDisposition).toBe("unknown");
  });
});
