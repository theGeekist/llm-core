import { describe, expect, it } from "bun:test";
import {
  contractVersion,
  coreId,
  digest,
  type EvidenceId,
  type InvocationId,
  type ResourceId,
  type RunId,
  type StepId,
} from "../../src/contracts/public";
import {
  createCostEstimate,
  createReconciledCost,
  createUsageReceipt,
  deriveReconciliationDisposition,
  type CostEstimate,
  type PriceFactPort,
  type PriceFactResult,
  type PriceSource,
  type ProviderCostReconciliationPort,
  type ProviderReconciliationResult,
  type UsageReceipt,
} from "../../src/features/evidence/public";
import {
  createResolvedModelIdentity,
  deploymentRef,
  providerRef,
} from "../../src/features/model/public";
import { modelProfileId, modelRef } from "../../src/features/model/runtime";

const ESTIMATE_ID = coreId<EvidenceId>("0190bd0c-0000-7000-8000-0000000000b1");
const RECONCILIATION_ID = coreId<EvidenceId>("0190bd0c-0000-7000-8000-0000000000b2");
const RECEIPT_ID = coreId<EvidenceId>("0190bd0c-0000-7000-8000-0000000000b3");
const INVOCATION_ID = coreId<InvocationId>("0190bd0c-0000-7000-8000-0000000000b4");
const RUN_ID = coreId<RunId>("0190bd0c-0000-7000-8000-0000000000b5");
const STEP_ID = coreId<StepId>("0190bd0c-0000-7000-8000-0000000000b6");
const RESOURCE_ID = coreId<ResourceId>("0190bd0c-0000-7000-8000-0000000000b7");
const PROVIDER_EVIDENCE_ID = coreId<EvidenceId>("0190bd0c-0000-7000-8000-0000000000b8");

const sampleModel = () =>
  createResolvedModelIdentity({
    model: modelRef("example.chat"),
    provider: providerRef("example-provider"),
    deployment: deploymentRef("production"),
    profileId: modelProfileId("example.chat.production"),
    profileVersion: contractVersion("1.0.0"),
  });

const samplePriceSource = (): PriceSource => ({
  sourceId: "catalogue.rate-card-v1",
  sourceVersion: contractVersion("2026.8.0"),
  effectiveAt: "2026-08-01T00:00:00.000Z",
  currency: "USD",
});

const sampleReceipt = (overrides: Partial<UsageReceipt> = {}): UsageReceipt =>
  createUsageReceipt({
    receiptId: RECEIPT_ID,
    invocation: { invocationId: INVOCATION_ID, runId: RUN_ID, stepId: STEP_ID },
    observedAt: "2026-08-01T08:30:00.000Z",
    resolvedModel: sampleModel(),
    providerRequestId: "req-42",
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    },
    attribution: { kind: "attributed", source: "provider" },
    pricing: { kind: "unavailable", reason: "not-provided" },
    redaction: { kind: "not-required" },
    ...overrides,
  });

describe("Cost Ports and MaybePromise integration", () => {
  describe("PriceFactPort", () => {
    it("supports synchronous PriceFactPort implementation and snapshots cost estimate", () => {
      const syncPort: PriceFactPort = {
        resolve: (receipt, requestedCurrency) => {
          if (receipt.resolvedModel.model === "unknown.model") {
            return { kind: "unavailable", reason: "no-pricing" };
          }
          return {
            kind: "priced",
            priceSource: samplePriceSource(),
            currency: requestedCurrency,
            amount: "0.0050",
            units: [
              { metric: "inputTokens", quantity: 100 },
              { metric: "outputTokens", quantity: 50 },
            ],
            assumptions: ["cached tokens discounted"],
          };
        },
      };

      const receipt = sampleReceipt();
      const result = syncPort.resolve(receipt, "USD") as PriceFactResult;

      expect(result.kind).toBe("priced");
      if (result.kind === "priced") {
        const estimate = createCostEstimate({
          estimateId: ESTIMATE_ID,
          receipt,
          estimatedAt: "2026-08-01T08:31:00.000Z",
          units: result.units,
          disposition: {
            kind: "estimated",
            priceSource: result.priceSource,
            currency: result.currency,
            amount: result.amount,
            assumptions: result.assumptions,
          },
        });

        expect(estimate.disposition.kind).toBe("estimated");
        if (estimate.disposition.kind === "estimated") {
          expect(estimate.disposition.amount).toBe("0.0050");
          expect(estimate.disposition.priceSource.sourceId).toBe("catalogue.rate-card-v1");
        }
      }
    });

    it("supports asynchronous PriceFactPort implementation and snapshots unavailable estimate", async () => {
      const asyncPort: PriceFactPort = {
        resolve: async (_receipt, _requestedCurrency) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return {
            kind: "unavailable",
            reason: "stale-pricing",
          };
        },
      };

      const receipt = sampleReceipt();
      const result = await asyncPort.resolve(receipt, "USD");

      expect(result.kind).toBe("unavailable");
      if (result.kind === "unavailable") {
        const estimate = createCostEstimate({
          estimateId: ESTIMATE_ID,
          receipt,
          estimatedAt: "2026-08-01T08:31:00.000Z",
          units: [{ metric: "totalTokens", quantity: 150 }],
          disposition: {
            kind: "unavailable",
            reason: result.reason,
          },
        });

        expect(estimate.disposition.kind).toBe("unavailable");
        if (estimate.disposition.kind === "unavailable") {
          expect(estimate.disposition.reason).toBe("stale-pricing");
        }
      }
    });
  });

  describe("ProviderCostReconciliationPort", () => {
    it("supports synchronous ProviderCostReconciliationPort implementation", () => {
      const syncReconciler: ProviderCostReconciliationPort = {
        reconcile: (estimate) => {
          if (!estimate.receipt.providerRequestId) {
            return { kind: "unavailable", reason: "no-provider-record" };
          }
          return {
            kind: "recorded",
            record: {
              providerRecordId: "rec-ext-42",
              provider: providerRef("example-provider"),
              providerRequestId: estimate.receipt.providerRequestId,
              sourceId: "provider.billing-api",
              sourceVersion: contractVersion("2026.8.0"),
              evidenceRef: {
                evidenceId: PROVIDER_EVIDENCE_ID,
                kind: "execution-receipt",
                content: {
                  resourceId: RESOURCE_ID,
                  mediaType: "application/json",
                  byteLength: 42,
                  digest: digest(
                    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                  ),
                },
              },
              currency: "USD",
              amount: "0.005",
              recordedAt: "2026-08-01T08:35:00.000Z",
            },
          };
        },
      };

      const estimate: CostEstimate = createCostEstimate({
        estimateId: ESTIMATE_ID,
        receipt: sampleReceipt({
          invocation: { invocationId: INVOCATION_ID },
          providerRequestId: "req-abc",
        }),
        estimatedAt: "2026-08-01T08:31:00.000Z",
        units: [{ metric: "totalTokens", quantity: 150 }],
        disposition: {
          kind: "estimated",
          priceSource: samplePriceSource(),
          currency: "USD",
          amount: "0.0050",
        },
      });

      const result = syncReconciler.reconcile(estimate) as ProviderReconciliationResult;
      expect(result.kind).toBe("recorded");
      if (result.kind === "recorded") {
        const disposition = deriveReconciliationDisposition(estimate, result.record);
        expect(disposition).toEqual({ kind: "reconciled" });

        const reconciledCost = createReconciledCost({
          reconciliationId: RECONCILIATION_ID,
          estimate,
          providerRecord: result.record,
          disposition,
          reconciledAt: "2026-08-01T08:36:00.000Z",
        });

        expect(reconciledCost.disposition.kind).toBe("reconciled");
        expect(reconciledCost.providerRecord?.amount).toBe("0.005");
      }
    });

    it("supports asynchronous ProviderCostReconciliationPort implementation for pending reconciliation", async () => {
      const asyncReconciler: ProviderCostReconciliationPort = {
        reconcile: async (_estimate) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { kind: "unavailable", reason: "pending" };
        },
      };

      const estimate: CostEstimate = createCostEstimate({
        estimateId: ESTIMATE_ID,
        receipt: sampleReceipt({ invocation: { invocationId: INVOCATION_ID } }),
        estimatedAt: "2026-08-01T08:31:00.000Z",
        units: [{ metric: "totalTokens", quantity: 150 }],
        disposition: {
          kind: "estimated",
          priceSource: samplePriceSource(),
          currency: "USD",
          amount: "0.0050",
        },
      });

      const result = await asyncReconciler.reconcile(estimate);
      expect(result.kind).toBe("unavailable");
      if (result.kind === "unavailable") {
        const reconciledCost = createReconciledCost({
          reconciliationId: RECONCILIATION_ID,
          estimate,
          disposition: { kind: "unavailable", reason: result.reason },
          reconciledAt: "2026-08-01T08:36:00.000Z",
        });

        expect(reconciledCost.disposition.kind).toBe("unavailable");
        expect(reconciledCost.providerRecord).toBeUndefined();
      }
    });
  });
});
