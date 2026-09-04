import { describe, expect, it } from "bun:test";
import {
  contractVersion,
  coreId,
  digest,
  schemaRef,
  type EvidenceId,
  type EvidenceRef,
  type InvocationId,
  type ResourceId,
  type RunId,
  type StepId,
} from "../../src/contracts/public";
import {
  createCostEstimate,
  createUsageReceipt,
  type CostEstimate,
  type PriceSource,
  type UsageReceipt,
} from "../../src/features/evidence/public";
import {
  createResolvedModelIdentity,
  deploymentRef,
  providerRef,
} from "../../src/features/model/public";
import { modelProfileId, modelRef } from "../../src/features/model/runtime";

const ESTIMATE_ID = coreId<EvidenceId>("0190bd0c-0000-7000-8000-000000000071");
const RECEIPT_ID = coreId<EvidenceId>("0190bd0c-0000-7000-8000-000000000072");
const INVOCATION_ID = coreId<InvocationId>("0190bd0c-0000-7000-8000-000000000073");
const RUN_ID = coreId<RunId>("0190bd0c-0000-7000-8000-000000000074");
const STEP_ID = coreId<StepId>("0190bd0c-0000-7000-8000-000000000075");
const RESOURCE_ID = coreId<ResourceId>("0190bd0c-0000-7000-8000-000000000076");
const EVIDENCE_ID = coreId<EvidenceId>("0190bd0c-0000-7000-8000-000000000077");

const sampleModel = () =>
  createResolvedModelIdentity({
    model: modelRef("example.chat"),
    provider: providerRef("example-provider"),
    deployment: deploymentRef("production"),
    profileId: modelProfileId("example.chat.production"),
    profileVersion: contractVersion("1.0.0"),
  });

const sampleReceipt = (overrides: Partial<UsageReceipt> = {}): UsageReceipt =>
  createUsageReceipt({
    receiptId: RECEIPT_ID,
    invocation: { invocationId: INVOCATION_ID, runId: RUN_ID, stepId: STEP_ID },
    observedAt: "2026-08-01T07:00:00.000Z",
    resolvedModel: sampleModel(),
    providerRequestId: "req-99",
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

const samplePriceSource = (overrides: Partial<PriceSource> = {}): PriceSource => ({
  sourceId: "catalogue.provider-standard",
  sourceVersion: contractVersion("2026.8.1"),
  effectiveAt: "2026-08-01T00:00:00.000Z",
  currency: "USD",
  ...overrides,
});

const sampleEvidenceRef = (): EvidenceRef => ({
  evidenceId: EVIDENCE_ID,
  kind: "execution-receipt",
  content: {
    resourceId: RESOURCE_ID,
    mediaType: "application/json",
    byteLength: 42,
    digest: digest("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
  },
  schema: schemaRef({
    schemaId: "urn:example:schema:test",
    version: "1.0.0",
    digest: digest("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
  }),
});

const validEstimatedInput = (overrides: Partial<CostEstimate> = {}): CostEstimate => ({
  estimateId: ESTIMATE_ID,
  receipt: sampleReceipt(),
  estimatedAt: "2026-08-01T07:05:00.000Z",
  units: [
    { metric: "inputTokens", quantity: 100 },
    { metric: "outputTokens", quantity: 50 },
  ],
  correlation: { namespace: "billing-project", correlationId: "proj-123" },
  disposition: {
    kind: "estimated",
    priceSource: samplePriceSource(),
    currency: "USD",
    amount: "0.0042",
    assumptions: ["blended token rate", "standard tier"],
  },
  ...overrides,
});

describe("CostEstimate", () => {
  it("snapshots a full cost estimate with price source, assumptions, and correlation", () => {
    const estimate = createCostEstimate(validEstimatedInput());

    expect(estimate.estimateId).toBe(ESTIMATE_ID);
    expect(estimate.receipt.receiptId).toBe(RECEIPT_ID);
    expect(estimate.estimatedAt).toBe("2026-08-01T07:05:00.000Z");
    expect(estimate.units).toEqual([
      { metric: "inputTokens", quantity: 100 },
      { metric: "outputTokens", quantity: 50 },
    ]);
    expect(estimate.receipt.invocation).toEqual({
      invocationId: INVOCATION_ID,
      runId: RUN_ID,
      stepId: STEP_ID,
    });
    expect(estimate.receipt.providerRequestId).toBe("req-99");
    expect(estimate.correlation).toEqual({
      namespace: "billing-project",
      correlationId: "proj-123",
    });

    expect(estimate.disposition.kind).toBe("estimated");
    if (estimate.disposition.kind === "estimated") {
      expect(estimate.disposition.amount).toBe("0.0042");
      expect(estimate.disposition.currency).toBe("USD");
      expect(estimate.disposition.priceSource.sourceId).toBe("catalogue.provider-standard");
      expect(estimate.disposition.priceSource.sourceVersion).toBe(contractVersion("2026.8.1"));
      expect(estimate.disposition.assumptions).toEqual(["blended token rate", "standard tier"]);
    }
  });

  it("snapshots a partial cost estimate with missing usage metrics", () => {
    const estimate = createCostEstimate(
      validEstimatedInput({
        disposition: {
          kind: "partial",
          priceSource: samplePriceSource(),
          currency: "USD",
          amount: "0.0030",
          missing: ["reasoningTokens", "cachedInputTokens"],
          assumptions: ["reasoning tokens excluded from rate"],
        },
      }),
    );

    expect(estimate.disposition.kind).toBe("partial");
    if (estimate.disposition.kind === "partial") {
      expect(estimate.disposition.amount).toBe("0.0030");
      expect(estimate.disposition.currency).toBe("USD");
      expect(estimate.disposition.missing).toEqual(["reasoningTokens", "cachedInputTokens"]);
      expect(estimate.disposition.assumptions).toEqual(["reasoning tokens excluded from rate"]);
    }
  });

  it("structural invariant 1: unavailable estimate carries NO amount, NO currency, and NO price source", () => {
    const estimate = createCostEstimate(
      validEstimatedInput({
        disposition: {
          kind: "unavailable",
          reason: "no-pricing",
        },
      }),
    );

    expect(estimate.disposition.kind).toBe("unavailable");
    if (estimate.disposition.kind === "unavailable") {
      expect(estimate.disposition.reason).toBe("no-pricing");
      expect("amount" in estimate.disposition).toBe(false);
      expect("currency" in estimate.disposition).toBe(false);
      expect("priceSource" in estimate.disposition).toBe(false);
    }
    expect("amount" in estimate).toBe(false);
    expect("currency" in estimate).toBe(false);
    expect("priceSource" in estimate).toBe(false);

    // Attempting to provide amount or priceSource on unavailable disposition throws
    expect(() =>
      createCostEstimate(
        validEstimatedInput({
          disposition: {
            kind: "unavailable",
            reason: "no-pricing",
            amount: "0",
          } as unknown as CostEstimate["disposition"],
        }),
      ),
    ).toThrow(TypeError);

    expect(() =>
      createCostEstimate(
        validEstimatedInput({
          disposition: {
            kind: "unavailable",
            reason: "no-pricing",
            priceSource: samplePriceSource(),
          } as unknown as CostEstimate["disposition"],
        }),
      ),
    ).toThrow(TypeError);
  });

  it("preserves independent identities: invocation without runId/stepId, evidenceRef, and correlation", () => {
    const evidenceRef = sampleEvidenceRef();
    const estimate = createCostEstimate(
      validEstimatedInput({
        receipt: sampleReceipt({
          invocation: { invocationId: INVOCATION_ID },
          providerRequestId: undefined,
        }),
        evidenceRef,
        correlation: { namespace: "custom-system", correlationId: "audit-corr-99" },
      }),
    );

    expect(estimate.receipt.invocation).toEqual({ invocationId: INVOCATION_ID });
    expect(estimate.receipt.providerRequestId).toBeUndefined();
    expect(estimate.evidenceRef).toEqual(evidenceRef);
    expect(estimate.correlation).toEqual({
      namespace: "custom-system",
      correlationId: "audit-corr-99",
    });
  });

  it("rejects currency mismatch between price source and estimate", () => {
    expect(() =>
      createCostEstimate(
        validEstimatedInput({
          disposition: {
            kind: "estimated",
            priceSource: samplePriceSource({ currency: "EUR" }),
            currency: "USD",
            amount: "0.0042",
          },
        }),
      ),
    ).toThrow(TypeError);
  });

  it("rejects non-decimal amounts, NaN, and numeric types", () => {
    for (const invalidAmount of ["abc", "", "NaN", "1.5.0", "$1.50", " 1.50 "]) {
      expect(() =>
        createCostEstimate(
          validEstimatedInput({
            disposition: {
              kind: "estimated",
              priceSource: samplePriceSource(),
              currency: "USD",
              amount: invalidAmount,
            },
          }),
        ),
      ).toThrow(TypeError);
    }

    expect(() =>
      createCostEstimate(
        validEstimatedInput({
          disposition: {
            kind: "estimated",
            priceSource: samplePriceSource(),
            currency: "USD",
            amount: 0.0042 as unknown as string,
          },
        }),
      ),
    ).toThrow(TypeError);
  });

  it("requires dense, unique, non-negative usage units", () => {
    expect(() => createCostEstimate(validEstimatedInput({ units: [] }))).toThrow(TypeError);
    expect(() =>
      createCostEstimate(
        validEstimatedInput({
          units: [
            { metric: "inputTokens", quantity: 1 },
            { metric: "inputTokens", quantity: 2 },
          ],
        }),
      ),
    ).toThrow(TypeError);
    expect(() =>
      createCostEstimate(
        validEstimatedInput({ units: [{ metric: "outputTokens", quantity: -1 }] }),
      ),
    ).toThrow(TypeError);
    expect(() =>
      createCostEstimate(
        validEstimatedInput({ units: [{ metric: "inputTokens", quantity: 101 }] }),
      ),
    ).toThrow(TypeError);
  });

  it("rejects non-plain arrays and accessors without executing them", () => {
    class AssumptionArray extends Array<string> {}
    expect(() =>
      createCostEstimate(
        validEstimatedInput({
          disposition: {
            kind: "estimated",
            priceSource: samplePriceSource(),
            currency: "USD",
            amount: "0.0042",
            assumptions: new AssumptionArray("subclassed"),
          },
        }),
      ),
    ).toThrow(TypeError);

    let reads = 0;
    const assumptions = ["unread"];
    Object.defineProperty(assumptions, "0", {
      configurable: true,
      enumerable: true,
      get: () => {
        reads += 1;
        return "executed";
      },
    });
    expect(() =>
      createCostEstimate(
        validEstimatedInput({
          disposition: {
            kind: "estimated",
            priceSource: samplePriceSource(),
            currency: "USD",
            amount: "0.0042",
            assumptions,
          },
        }),
      ),
    ).toThrow(TypeError);
    expect(reads).toBe(0);
  });

  it("rejects charge authority, billing execution, and unpermitted root fields", () => {
    const forbiddenKeys = [
      "charge",
      "invoice",
      "paid",
      "accepted",
      "outcome",
      "interventionSuccess",
      "approved",
      "billingAuthority",
      "receiptId",
      "invocation",
      "resolvedModel",
      "providerRequestId",
      "amount",
      "currency",
    ];

    for (const forbiddenKey of forbiddenKeys) {
      expect(() =>
        createCostEstimate({
          ...validEstimatedInput(),
          [forbiddenKey]: "unauthorized",
        } as unknown as CostEstimate),
      ).toThrow(TypeError);
    }
  });

  it("freezes snapshot outputs and prevents caller mutation", () => {
    const inputData = validEstimatedInput({
      disposition: {
        kind: "estimated",
        priceSource: samplePriceSource(),
        currency: "USD",
        amount: "0.0042",
        assumptions: ["mutable assumption"],
      },
    });

    const estimate = createCostEstimate(inputData);

    expect(Object.isFrozen(estimate)).toBe(true);
    expect(Object.isFrozen(estimate.disposition)).toBe(true);

    // Mutating input assumptions array does not affect snapshot
    (inputData.disposition as { assumptions?: string[] }).assumptions!.push("new assumption");
    expect((estimate.disposition as { assumptions?: readonly string[] }).assumptions).toEqual([
      "mutable assumption",
    ]);

    // Mutating output throws in strict mode
    expect(() => {
      // @ts-expect-error mutating frozen property
      estimate.estimatedAt = "mutated";
    }).toThrow();
  });

  it("rejects sparse arrays, prototype pollution, and malformed correlation", () => {
    const sparseAssumptions = ["first"];
    sparseAssumptions[2] = "third";

    expect(() =>
      createCostEstimate(
        validEstimatedInput({
          disposition: {
            kind: "estimated",
            priceSource: samplePriceSource(),
            currency: "USD",
            amount: "0.0042",
            assumptions: sparseAssumptions,
          },
        }),
      ),
    ).toThrow(TypeError);

    // Prototype pollution
    const polluted = JSON.parse('{"__proto__": {"polluted": true}}');
    expect(() => createCostEstimate({ ...validEstimatedInput(), ...polluted })).toThrow(TypeError);
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);

    // Empty correlation fields
    expect(() =>
      createCostEstimate(
        validEstimatedInput({
          correlation: { namespace: "", correlationId: "id" },
        }),
      ),
    ).toThrow(TypeError);

    expect(() =>
      createCostEstimate(
        validEstimatedInput({
          correlation: { namespace: "ns", correlationId: "" },
        }),
      ),
    ).toThrow(TypeError);
  });
});
