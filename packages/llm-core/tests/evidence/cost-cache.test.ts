import { describe, expect, it } from "bun:test";
import {
  contractVersion,
  coreId,
  type EvidenceId,
  type InvocationId,
  type RunId,
  type StepId,
} from "../../src/contracts/public";
import {
  createCacheAttributionRecord,
  createUsageReceipt,
  type CacheAttributionRecord,
  type UsageReceipt,
} from "../../src/features/evidence/public";
import {
  createResolvedModelIdentity,
  deploymentRef,
  providerRef,
} from "../../src/features/model/public";
import { modelProfileId, modelRef } from "../../src/features/model/runtime";

const ATTRIBUTION_ID = coreId<EvidenceId>("0190bd0c-0000-7000-8000-0000000000a1");
const RECEIPT_ID = coreId<EvidenceId>("0190bd0c-0000-7000-8000-0000000000a2");
const INVOCATION_ID = coreId<InvocationId>("0190bd0c-0000-7000-8000-0000000000a3");
const RUN_ID = coreId<RunId>("0190bd0c-0000-7000-8000-0000000000a4");
const STEP_ID = coreId<StepId>("0190bd0c-0000-7000-8000-0000000000a5");

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
    observedAt: "2026-08-01T07:59:00.000Z",
    resolvedModel: sampleModel(),
    providerRequestId: "req-cache-1",
    usage: {
      inputTokens: 100,
      outputTokens: 25,
      totalTokens: 125,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    },
    attribution: { kind: "attributed", source: "provider" },
    pricing: { kind: "unavailable", reason: "not-provided" },
    redaction: { kind: "not-required" },
    ...overrides,
  });

const validInput = (overrides: Partial<CacheAttributionRecord> = {}): CacheAttributionRecord => ({
  cacheAttributionId: ATTRIBUTION_ID,
  receipt: sampleReceipt(),
  observedAt: "2026-08-01T08:00:00.000Z",
  attribution: {
    kind: "reuse",
    avoidedUsage: {
      kind: "estimated",
      basis: "prior-observed-usage",
      usage: { inputTokens: 500, cachedInputTokens: 500 },
    },
  },
  ...overrides,
});

describe("CacheAttributionRecord", () => {
  it("snapshots cache reuse with estimated avoided usage based on prior observation", () => {
    const record = createCacheAttributionRecord(validInput());

    expect(record.cacheAttributionId).toBe(ATTRIBUTION_ID);
    expect(record.receipt.receiptId).toBe(RECEIPT_ID);
    expect(record.receipt.invocation).toEqual({
      invocationId: INVOCATION_ID,
      runId: RUN_ID,
      stepId: STEP_ID,
    });
    expect(record.observedAt).toBe("2026-08-01T08:00:00.000Z");
    expect(record.attribution.kind).toBe("reuse");
    if (record.attribution.kind === "reuse") {
      expect(record.attribution.avoidedUsage.kind).toBe("estimated");
      if (record.attribution.avoidedUsage.kind === "estimated") {
        expect(record.attribution.avoidedUsage.basis).toBe("prior-observed-usage");
        expect(record.attribution.avoidedUsage.usage).toEqual({
          inputTokens: 500,
          cachedInputTokens: 500,
        });
      }
    }
  });

  it("snapshots cache reuse with declared baseline and unavailable avoided usage", () => {
    const declaredBaseline = createCacheAttributionRecord(
      validInput({
        attribution: {
          kind: "reuse",
          avoidedUsage: {
            kind: "estimated",
            basis: "declared-baseline",
            usage: { totalTokens: 1200 },
          },
        },
      }),
    );
    expect(declaredBaseline.attribution.kind).toBe("reuse");
    if (declaredBaseline.attribution.kind === "reuse") {
      expect(declaredBaseline.attribution.avoidedUsage.kind).toBe("estimated");
    }

    const unmeasurable = createCacheAttributionRecord(
      validInput({
        attribution: {
          kind: "reuse",
          avoidedUsage: {
            kind: "unavailable",
            reason: "not-measurable",
          },
        },
      }),
    );
    expect(unmeasurable.attribution.kind).toBe("reuse");
    if (unmeasurable.attribution.kind === "reuse") {
      expect(unmeasurable.attribution.avoidedUsage).toEqual({
        kind: "unavailable",
        reason: "not-measurable",
      });
    }

    const noBaseline = createCacheAttributionRecord(
      validInput({
        attribution: {
          kind: "reuse",
          avoidedUsage: {
            kind: "unavailable",
            reason: "no-baseline",
          },
        },
      }),
    );
    expect(noBaseline.attribution.kind).toBe("reuse");
    if (noBaseline.attribution.kind === "reuse") {
      expect(noBaseline.attribution.avoidedUsage).toEqual({
        kind: "unavailable",
        reason: "no-baseline",
      });
    }
  });

  it("snapshots not-applicable and cache miss dispositions", () => {
    const notApplicable = createCacheAttributionRecord(
      validInput({
        attribution: { kind: "not-applicable" },
      }),
    );
    expect(notApplicable.attribution).toEqual({ kind: "not-applicable" });

    const miss = createCacheAttributionRecord(
      validInput({
        attribution: {
          kind: "miss",
        },
      }),
    );
    expect(miss.attribution).toEqual({
      kind: "miss",
    });
  });

  it("invariant: miss cannot carry avoided usage", () => {
    expect(() =>
      createCacheAttributionRecord(
        validInput({
          attribution: {
            kind: "miss",
            // @ts-expect-error miss cannot carry avoided usage
            avoidedUsage: {
              kind: "unavailable",
              reason: "no-baseline",
            },
          },
        }),
      ),
    ).toThrow(TypeError);
  });

  it("invariant: ZERO money or charge semantics anywhere in record or attribution", () => {
    const forbiddenFields = [
      { amount: "1.50" },
      { currency: "USD" },
      { priceSource: "catalogue" },
      { savedCost: "1.00" },
      { savedDollars: "1.00" },
      { cost: "0.50" },
      { charge: "0" },
      { savings: "50%" },
    ];

    for (const field of forbiddenFields) {
      // Root injection
      expect(() =>
        createCacheAttributionRecord({
          ...validInput(),
          ...field,
        } as unknown as CacheAttributionRecord),
      ).toThrow(TypeError);

      // Attribution injection
      expect(() =>
        createCacheAttributionRecord({
          ...validInput(),
          attribution: {
            ...validInput().attribution,
            ...field,
          } as unknown as CacheAttributionRecord["attribution"],
        }),
      ).toThrow(TypeError);
    }
  });

  it("preserves independent identities: invocation without runId/stepId", () => {
    const record = createCacheAttributionRecord(
      validInput({
        receipt: sampleReceipt({ invocation: { invocationId: INVOCATION_ID } }),
      }),
    );

    expect(record.receipt.invocation).toEqual({ invocationId: INVOCATION_ID });
    expect(record.receipt.invocation.runId).toBeUndefined();
    expect(record.receipt.invocation.stepId).toBeUndefined();
  });

  it("freezes snapshot outputs and prevents caller mutation", () => {
    const inputData = validInput({
      attribution: {
        kind: "reuse",
        avoidedUsage: {
          kind: "estimated",
          basis: "prior-observed-usage",
          usage: { inputTokens: 100 },
        },
      },
    });

    const record = createCacheAttributionRecord(inputData);
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.attribution)).toBe(true);
    expect(Object.isFrozen(record.receipt)).toBe(true);
    expect(Object.isFrozen(record.receipt.invocation)).toBe(true);

    // Mutating output throws in strict mode
    expect(() => {
      // @ts-expect-error mutating frozen property
      record.observedAt = "2026-09-01T00:00:00.000Z";
    }).toThrow();
  });

  it("rejects prototype pollution and unknown fields", () => {
    const polluted = JSON.parse('{"__proto__": {"polluted": true}}');
    expect(() =>
      createCacheAttributionRecord({
        ...validInput(),
        ...polluted,
      }),
    ).toThrow(TypeError);
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);

    expect(() =>
      createCacheAttributionRecord(
        validInput({
          // @ts-expect-error extra root field
          unknownField: "test",
        }),
      ),
    ).toThrow(TypeError);
  });
});
