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
  type PriceSource,
  type ProviderCostRecord,
  type ReconciledCost,
  type UsageReceipt,
} from "../../src/features/evidence/public";
import {
  createResolvedModelIdentity,
  deploymentRef,
  providerRef,
} from "../../src/features/model/public";
import { modelProfileId, modelRef } from "../../src/features/model/runtime";

const RECONCILIATION_ID = coreId<EvidenceId>("0190bd0c-0000-7000-8000-000000000081");
const ESTIMATE_ID = coreId<EvidenceId>("0190bd0c-0000-7000-8000-000000000082");
const RECEIPT_ID = coreId<EvidenceId>("0190bd0c-0000-7000-8000-000000000083");
const INVOCATION_ID = coreId<InvocationId>("0190bd0c-0000-7000-8000-000000000084");
const RUN_ID = coreId<RunId>("0190bd0c-0000-7000-8000-000000000085");
const STEP_ID = coreId<StepId>("0190bd0c-0000-7000-8000-000000000086");
const RESOURCE_ID = coreId<ResourceId>("0190bd0c-0000-7000-8000-000000000087");
const PROVIDER_EVIDENCE_ID = coreId<EvidenceId>("0190bd0c-0000-7000-8000-000000000088");

const sampleModel = () =>
  createResolvedModelIdentity({
    model: modelRef("example.chat"),
    provider: providerRef("example-provider"),
    deployment: deploymentRef("production"),
    profileId: modelProfileId("example.chat.production"),
    profileVersion: contractVersion("1.0.0"),
  });

const samplePriceSource = (): PriceSource => ({
  sourceId: "catalogue.provider-standard",
  sourceVersion: contractVersion("2026.8.1"),
  effectiveAt: "2026-08-01T00:00:00.000Z",
  currency: "USD",
});

const sampleReceipt = (overrides: Partial<UsageReceipt> = {}): UsageReceipt =>
  createUsageReceipt({
    receiptId: RECEIPT_ID,
    invocation: { invocationId: INVOCATION_ID, runId: RUN_ID, stepId: STEP_ID },
    observedAt: "2026-08-01T07:00:00.000Z",
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

const sampleEstimate = (overrides: Partial<CostEstimate> = {}): CostEstimate =>
  createCostEstimate({
    estimateId: ESTIMATE_ID,
    receipt: sampleReceipt(),
    estimatedAt: "2026-08-01T07:05:00.000Z",
    units: [{ metric: "totalTokens", quantity: 150 }],
    correlation: { namespace: "org-alpha", correlationId: "corr-1" },
    disposition: {
      kind: "estimated",
      priceSource: samplePriceSource(),
      currency: "USD",
      amount: "1.50",
    },
    ...overrides,
  });

const sampleProviderRecord = (overrides: Partial<ProviderCostRecord> = {}): ProviderCostRecord => ({
  providerRecordId: "prov-rec-42",
  provider: providerRef("example-provider"),
  sourceId: "provider.billing-api",
  sourceVersion: contractVersion("2026.8.0"),
  evidenceRef: {
    evidenceId: PROVIDER_EVIDENCE_ID,
    kind: "execution-receipt",
    content: {
      resourceId: RESOURCE_ID,
      mediaType: "application/json",
      byteLength: 42,
      digest: digest("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
    },
  },
  recordedAt: "2026-08-01T07:10:00.000Z",
  currency: "USD",
  amount: "1.5",
  providerRequestId: "req-42",
  ...overrides,
});

describe("CostReconciliation", () => {
  it("derives exact decimal equality: 1.50 matches 1.5 without float inaccuracies", () => {
    const estimate = sampleEstimate({
      disposition: {
        kind: "estimated",
        priceSource: samplePriceSource(),
        currency: "USD",
        amount: "1.50",
      },
    });
    const providerRecord = sampleProviderRecord({ amount: "1.5" });

    const derived = deriveReconciliationDisposition(estimate, providerRecord);
    expect(derived).toEqual({ kind: "reconciled" });

    const reconciled = createReconciledCost({
      reconciliationId: RECONCILIATION_ID,
      estimate,
      providerRecord,
      disposition: derived,
      reconciledAt: "2026-08-01T07:15:00.000Z",
    });

    expect(reconciled.reconciliationId).toBe(RECONCILIATION_ID);
    expect(reconciled.disposition.kind).toBe("reconciled");
    expect(reconciled.estimate.disposition.kind).toBe("estimated");
    if (reconciled.estimate.disposition.kind === "estimated") {
      expect(reconciled.estimate.disposition.amount).toBe("1.50");
    }
    expect(reconciled.providerRecord?.amount).toBe("1.5");
  });

  it("derives decimal equality across leading/trailing zeros and zero representations", () => {
    const pairs = [
      ["0012.300", "12.3"],
      ["0.00", "0"],
      ["0", "-0.0"],
      ["0.000042", "0.0000420"],
    ] as const;

    for (const [estAmount, provAmount] of pairs) {
      const estimate = sampleEstimate({
        disposition: {
          kind: "estimated",
          priceSource: samplePriceSource(),
          currency: "USD",
          amount: estAmount,
        },
      });
      const providerRecord = sampleProviderRecord({ amount: provAmount });
      expect(deriveReconciliationDisposition(estimate, providerRecord)).toEqual({
        kind: "reconciled",
      });
    }
  });

  it("derives amount-mismatch divergence when currencies match but amounts differ", () => {
    const estimate = sampleEstimate({
      disposition: {
        kind: "estimated",
        priceSource: samplePriceSource(),
        currency: "USD",
        amount: "1.50",
      },
    });
    const providerRecord = sampleProviderRecord({ amount: "1.55" });

    const derived = deriveReconciliationDisposition(estimate, providerRecord);
    expect(derived).toEqual({
      kind: "divergent",
      reason: "amount-mismatch",
    });

    const reconciled = createReconciledCost({
      reconciliationId: RECONCILIATION_ID,
      estimate,
      providerRecord,
      disposition: derived,
      reconciledAt: "2026-08-01T07:15:00.000Z",
    });
    expect(reconciled.disposition.kind).toBe("divergent");
  });

  it("derives currency-mismatch divergence without attempting currency conversion", () => {
    const estimate = sampleEstimate({
      disposition: {
        kind: "estimated",
        priceSource: samplePriceSource(),
        currency: "USD",
        amount: "1.50",
      },
    });
    const providerRecord = sampleProviderRecord({
      currency: "EUR",
      amount: "1.50",
    });

    const derived = deriveReconciliationDisposition(estimate, providerRecord);
    expect(derived).toEqual({
      kind: "divergent",
      reason: "currency-mismatch",
    });
  });

  it("derives unreconcilable when estimate disposition is unavailable", () => {
    const estimate = sampleEstimate({
      disposition: {
        kind: "unavailable",
        reason: "no-pricing",
      },
    });
    const providerRecord = sampleProviderRecord();

    const derived = deriveReconciliationDisposition(estimate, providerRecord);
    expect(derived).toEqual({
      kind: "unreconcilable",
      reason: "estimate-unavailable",
    });

    const reconciled = createReconciledCost({
      reconciliationId: RECONCILIATION_ID,
      estimate,
      providerRecord,
      disposition: derived,
      reconciledAt: "2026-08-01T07:15:00.000Z",
    });
    expect(reconciled.disposition.kind).toBe("unreconcilable");
  });

  it("structural invariant 2: provider record presence is biconditional with reconciled/divergent/unreconcilable", () => {
    const estimate = sampleEstimate();

    // Absent provider record requires unavailable disposition
    const pendingCost = createReconciledCost({
      reconciliationId: RECONCILIATION_ID,
      estimate,
      disposition: { kind: "unavailable", reason: "pending" },
      reconciledAt: "2026-08-01T07:15:00.000Z",
    });
    expect(pendingCost.disposition.kind).toBe("unavailable");
    expect(pendingCost.providerRecord).toBeUndefined();

    const noRecordCost = createReconciledCost({
      reconciliationId: RECONCILIATION_ID,
      estimate,
      disposition: { kind: "unavailable", reason: "no-provider-record" },
      reconciledAt: "2026-08-01T07:15:00.000Z",
    });
    expect(noRecordCost.disposition.kind).toBe("unavailable");

    // Absent provider record with reconciled/divergent/unreconcilable throws
    expect(() =>
      createReconciledCost({
        reconciliationId: RECONCILIATION_ID,
        estimate,
        disposition: { kind: "reconciled" },
        reconciledAt: "2026-08-01T07:15:00.000Z",
      }),
    ).toThrow(TypeError);

    expect(() =>
      createReconciledCost({
        reconciliationId: RECONCILIATION_ID,
        estimate,
        disposition: {
          kind: "divergent",
          reason: "amount-mismatch",
        },
        reconciledAt: "2026-08-01T07:15:00.000Z",
      }),
    ).toThrow(TypeError);

    // Present provider record with unavailable disposition throws
    expect(() =>
      createReconciledCost({
        reconciliationId: RECONCILIATION_ID,
        estimate,
        providerRecord: sampleProviderRecord(),
        disposition: { kind: "unavailable", reason: "pending" },
        reconciledAt: "2026-08-01T07:15:00.000Z",
      }),
    ).toThrow(TypeError);
  });

  it("rejects contradictory providerRequestId in derivation and creation", () => {
    const estimate = sampleEstimate({ receipt: sampleReceipt({ providerRequestId: "req-42" }) });
    const contradictoryRecord = sampleProviderRecord({ providerRequestId: "req-99" });

    expect(() => deriveReconciliationDisposition(estimate, contradictoryRecord)).toThrow(TypeError);
    expect(() =>
      createReconciledCost({
        reconciliationId: RECONCILIATION_ID,
        estimate,
        providerRecord: contradictoryRecord,
        disposition: { kind: "reconciled" },
        reconciledAt: "2026-08-01T07:15:00.000Z",
      }),
    ).toThrow(TypeError);
  });

  it("retains provider source evidence and rejects provider identity drift", () => {
    const estimate = sampleEstimate();
    const providerRecord = sampleProviderRecord();
    const reconciled = createReconciledCost({
      reconciliationId: RECONCILIATION_ID,
      estimate,
      providerRecord,
      disposition: { kind: "reconciled" },
      reconciledAt: "2026-08-01T07:15:00.000Z",
    });

    expect(reconciled.providerRecord?.provider).toBe(providerRef("example-provider"));
    expect(reconciled.providerRecord?.sourceId).toBe("provider.billing-api");
    expect(reconciled.providerRecord?.sourceVersion).toBe(contractVersion("2026.8.0"));
    expect(reconciled.providerRecord?.evidenceRef.evidenceId).toBe(PROVIDER_EVIDENCE_ID);

    const contradictoryRecord = sampleProviderRecord({ provider: providerRef("other-provider") });
    expect(() => deriveReconciliationDisposition(estimate, contradictoryRecord)).toThrow(TypeError);
    expect(() =>
      createReconciledCost({
        reconciliationId: RECONCILIATION_ID,
        estimate,
        providerRecord: contradictoryRecord,
        disposition: { kind: "reconciled" },
        reconciledAt: "2026-08-01T07:15:00.000Z",
      }),
    ).toThrow(TypeError);
  });

  it("permits reconciliation when providerRequestId matches or is omitted", () => {
    const matchingEstimate = sampleEstimate({
      receipt: sampleReceipt({ providerRequestId: "req-42" }),
    });
    const matchingRecord = sampleProviderRecord({ providerRequestId: "req-42" });

    expect(() =>
      createReconciledCost({
        reconciliationId: RECONCILIATION_ID,
        estimate: matchingEstimate,
        providerRecord: matchingRecord,
        disposition: { kind: "reconciled" },
        reconciledAt: "2026-08-01T07:15:00.000Z",
      }),
    ).not.toThrow();

    const omittedEstimate = sampleEstimate({
      receipt: sampleReceipt({ providerRequestId: undefined }),
    });
    const recordWithId = sampleProviderRecord({ providerRequestId: "req-42" });

    expect(() =>
      createReconciledCost({
        reconciliationId: RECONCILIATION_ID,
        estimate: omittedEstimate,
        providerRecord: recordWithId,
        disposition: { kind: "reconciled" },
        reconciledAt: "2026-08-01T07:15:00.000Z",
      }),
    ).not.toThrow();
  });

  it("rejects caller-mislabeled dispositions that contradict derived truth", () => {
    const estimate = sampleEstimate({
      disposition: {
        kind: "estimated",
        priceSource: samplePriceSource(),
        currency: "USD",
        amount: "1.00",
      },
    });
    const providerRecord = sampleProviderRecord({ amount: "2.00" });

    // Calling it reconciled when it's divergent throws
    expect(() =>
      createReconciledCost({
        reconciliationId: RECONCILIATION_ID,
        estimate,
        providerRecord,
        disposition: { kind: "reconciled" },
        reconciledAt: "2026-08-01T07:15:00.000Z",
      }),
    ).toThrow(TypeError);

    // Calling it currency-mismatch when amounts differ throws
    expect(() =>
      createReconciledCost({
        reconciliationId: RECONCILIATION_ID,
        estimate,
        providerRecord,
        disposition: {
          kind: "divergent",
          reason: "currency-mismatch",
        },
        reconciledAt: "2026-08-01T07:15:00.000Z",
      }),
    ).toThrow(TypeError);
  });

  it("rejects authority fields nested in every reconciliation disposition", () => {
    const estimate = sampleEstimate();
    const providerRecord = sampleProviderRecord();
    for (const key of ["accepted", "outcome", "approved", "charge", "billingAuthority"]) {
      expect(() =>
        createReconciledCost({
          reconciliationId: RECONCILIATION_ID,
          estimate,
          providerRecord,
          disposition: {
            kind: "reconciled",
            [key]: true,
          } as unknown as ReconciledCost["disposition"],
          reconciledAt: "2026-08-01T07:15:00.000Z",
        }),
      ).toThrow(TypeError);
    }
  });

  it("rejects extra root fields: payment, charge, settlement, or invoice", () => {
    const estimate = sampleEstimate();
    const providerRecord = sampleProviderRecord();

    const forbiddenKeys = ["paid", "invoice", "settlement", "accepted", "charge", "approved"];
    for (const key of forbiddenKeys) {
      expect(() =>
        createReconciledCost({
          reconciliationId: RECONCILIATION_ID,
          estimate,
          providerRecord,
          disposition: { kind: "reconciled" },
          reconciledAt: "2026-08-01T07:15:00.000Z",
          [key]: true,
        } as unknown as ReconciledCost),
      ).toThrow(TypeError);
    }
  });

  it("freezes reconciled cost output and all nested snapshots", () => {
    const estimate = sampleEstimate();
    const providerRecord = sampleProviderRecord();

    const reconciled = createReconciledCost({
      reconciliationId: RECONCILIATION_ID,
      estimate,
      providerRecord,
      disposition: { kind: "reconciled" },
      reconciledAt: "2026-08-01T07:15:00.000Z",
    });

    expect(Object.isFrozen(reconciled)).toBe(true);
    expect(Object.isFrozen(reconciled.disposition)).toBe(true);
    expect(Object.isFrozen(reconciled.providerRecord)).toBe(true);
    expect(Object.isFrozen(reconciled.estimate)).toBe(true);
  });
});
