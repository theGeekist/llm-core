import { describe, expect, test } from "bun:test";
import { coreId, digest, schemaRef, type EvidenceId, type ResourceId } from "#contracts";
import { executeControlledTool, reconcileControlledToolReceipt } from "../../../src/tools/runtime";
import {
  baseInput,
  facts,
  id,
  MemoryJournal,
} from "../../application/tool-execution/execute-fixtures";

type PreparedInvoice = Readonly<{
  consentReference: string;
  amount: number;
  pageCursor: string | null;
}>;

class OAuthBillingSaasSlice {
  readonly journal = new MemoryJournal();
  readonly seenWebhookIds = new Set<string>();
  readonly reconciliationWebhooks = new Map<EvidenceId, string>();
  readonly lifecycle = [] as string[];
  readonly pages = new Map<string | null, readonly string[]>([
    [null, ["invoice-001", "invoice-002"]],
    ["after:invoice-002", ["invoice-003"]],
  ]);
  rateLimitedUntil: string | null = null;
  executions = 0;

  discover() {
    return {
      connector: "example-billing-oauth-v1",
      capabilities: ["invoices.list", "invoices.create"] as const,
      consentReferenceRequired: true,
    };
  }

  list(cursor: string | null) {
    const invoices = this.pages.get(cursor) ?? [];
    return {
      invoices,
      nextCursor: cursor === null ? "after:invoice-002" : null,
    };
  }

  prepare(input: PreparedInvoice): PreparedInvoice {
    if (!input.consentReference.startsWith("grant:")) throw new Error("consent-required");
    if (!Number.isInteger(input.amount)) throw new Error("invalid-amount");
    return Object.freeze({ ...input });
  }

  async invoke(prepared: PreparedInvoice, outcome: "ambiguous" | "succeeds") {
    if (this.rateLimitedUntil !== null) {
      return { status: "rate-limited" as const, retryAt: this.rateLimitedUntil };
    }
    return executeControlledTool(
      baseInput(this.journal, ({ call }) => {
        this.executions += 1;
        if (outcome === "ambiguous") throw new Error("provider-outcome-unknown");
        return {
          toolCallId: call.toolCallId,
          status: "succeeded" as const,
          content: [{ kind: "text" as const, text: `invoice:${prepared.amount}` }],
        };
      }),
    );
  }

  acceptWebhook(receiptId: EvidenceId, eventId: string): "accepted" | "duplicate" {
    if (this.seenWebhookIds.has(eventId)) return "duplicate";
    this.seenWebhookIds.add(eventId);
    this.reconciliationWebhooks.set(receiptId, eventId);
    this.lifecycle.push(`webhook:${eventId}`);
    return "accepted";
  }

  async reconcile(receiptId: EvidenceId) {
    const webhookId = this.reconciliationWebhooks.get(receiptId);
    if (webhookId === undefined) throw new Error("reconciliation-webhook-required");
    this.lifecycle.push(`reconcile:${webhookId}`);
    this.journal.now = "2026-08-25T00:02:00.000Z";
    return reconcileControlledToolReceipt({
      receiptId,
      journal: this.journal,
      receiptOwner: { ownerId: "oauth-polling-reconciler" },
      receiptLeaseDurationMs: 60_000,
      facts: { ...facts(), now: () => "2026-08-25T00:02:00.000Z" },
      reconciler: {
        reconcile: () =>
          Promise.resolve({
            kind: "known" as const,
            disposition: "applied" as const,
            observedAt: "2026-08-25T00:02:00.000Z",
            evidence: {
              evidenceId: coreId<EvidenceId>(id(80)),
              kind: "execution-receipt" as const,
              content: {
                resourceId: coreId<ResourceId>(id(81)),
                mediaType: "application/json; charset=utf-8",
                byteLength: 2,
                digest: digest("c".repeat(64)),
              },
              schema: schemaRef({
                schemaId: "https://example.test/oauth-billing/reconciliation",
                version: "1.0.0",
                digest: digest("d".repeat(64)),
              }),
            },
          }),
      },
    });
  }
}

describe("connector characterization: OAuth SaaS slice", () => {
  test("keeps consent, pagination, rate limiting, webhooks and reconciliation application-owned", async () => {
    const slice = new OAuthBillingSaasSlice();
    expect(slice.discover()).toEqual({
      connector: "example-billing-oauth-v1",
      capabilities: ["invoices.list", "invoices.create"],
      consentReferenceRequired: true,
    });
    expect(slice.list(null)).toEqual({
      invoices: ["invoice-001", "invoice-002"],
      nextCursor: "after:invoice-002",
    });
    expect(slice.list("after:invoice-002")).toEqual({
      invoices: ["invoice-003"],
      nextCursor: null,
    });

    const prepared = slice.prepare({
      consentReference: "grant:billing/acme",
      amount: 300,
      pageCursor: "after:invoice-002",
    });
    expect(JSON.stringify(prepared)).not.toContain("token");

    const ambiguous = await slice.invoke(prepared, "ambiguous");
    expect(ambiguous.status).toBe("indeterminate");
    if (!("receipt" in ambiguous)) throw new Error("Expected a durable controlled receipt.");
    expect(slice.acceptWebhook(ambiguous.receipt.receiptId, "provider-event-17")).toBe("accepted");
    expect(slice.acceptWebhook(ambiguous.receipt.receiptId, "provider-event-17")).toBe("duplicate");
    const reconciled = await slice.reconcile(ambiguous.receipt.receiptId);
    expect(reconciled.status).toBe("reconciled");
    expect("receipt" in reconciled && reconciled.receipt.effectDisposition).toBe("applied");
    expect(slice.lifecycle).toEqual(["webhook:provider-event-17", "reconcile:provider-event-17"]);
    expect(slice.executions).toBe(1);

    slice.rateLimitedUntil = "2026-08-25T00:03:00.000Z";
    await expect(slice.invoke(prepared, "succeeds")).resolves.toEqual({
      status: "rate-limited",
      retryAt: "2026-08-25T00:03:00.000Z",
    });
  });
});
