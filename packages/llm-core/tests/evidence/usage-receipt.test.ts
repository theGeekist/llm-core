import { describe, expect, it } from "bun:test";
import {
  contractVersion,
  coreId,
  nativeExtensions,
  type EvidenceId,
  type InvocationId,
  type RunId,
  type StepId,
} from "../../src/contracts/public";
import {
  createBudgetDecisionEvidence,
  createObservedModelUsageReceipt,
  createUsageReceipt,
  type UsageReceiptInput,
} from "../../src/features/evidence/public";
import {
  createResolvedModelIdentity,
  createBuiltinModel,
  deploymentRef,
  providerRef,
} from "../../src/features/model/public";
import { modelProfileId, modelRef } from "../../src/features/model/runtime";

const RECEIPT_ID = coreId<EvidenceId>("0190bd0c-0000-7000-8000-000000000091");
const BUDGET_ID = coreId<EvidenceId>("0190bd0c-0000-7000-8000-000000000092");
const INVOCATION_ID = coreId<InvocationId>("0190bd0c-0000-7000-8000-000000000093");
const RUN_ID = coreId<RunId>("0190bd0c-0000-7000-8000-000000000094");
const STEP_ID = coreId<StepId>("0190bd0c-0000-7000-8000-000000000095");

const resolvedModel = () =>
  createResolvedModelIdentity({
    model: modelRef("example.chat"),
    provider: providerRef("example-provider"),
    deployment: deploymentRef("production"),
    profileId: modelProfileId("example.chat.production"),
    profileVersion: contractVersion("1.0.0"),
  });

const input = (overrides: Partial<UsageReceiptInput> = {}): UsageReceiptInput => ({
  receiptId: RECEIPT_ID,
  invocation: { invocationId: INVOCATION_ID, runId: RUN_ID, stepId: STEP_ID },
  observedAt: "2026-08-01T07:00:00.000Z",
  resolvedModel: resolvedModel(),
  providerRequestId: "request-42",
  usage: {
    inputTokens: 120,
    outputTokens: 45,
    totalTokens: 165,
    reasoningTokens: 0,
    cachedInputTokens: 0,
  },
  attribution: { kind: "attributed", source: "provider" },
  pricing: { kind: "unavailable", reason: "not-provided" },
  redaction: { kind: "not-required" },
  ...overrides,
});

describe("UsageReceipt", () => {
  it("snapshots observed usage, exact resolved identity, and a bound budget decision", () => {
    const decision = createBudgetDecisionEvidence({
      evidenceId: BUDGET_ID,
      invocation: { invocationId: INVOCATION_ID, runId: RUN_ID, stepId: STEP_ID },
      decidedAt: "2026-08-01T06:59:00.000Z",
      phase: "post-completion",
      decision: "warn",
      limit: "total-tokens",
    });
    const mutable = input({ budgetDecision: decision });
    const receipt = createUsageReceipt(mutable);

    mutable.usage!.inputTokens = 1;
    expect(receipt.usage).toEqual({
      inputTokens: 120,
      outputTokens: 45,
      totalTokens: 165,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    });
    expect(receipt.budgetDecision).toEqual(decision);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.resolvedModel)).toBe(true);
  });

  it("makes unavailable and stale pricing explicit without minting a cost", () => {
    const unknown = createUsageReceipt(input());
    const stale = createUsageReceipt(input({ pricing: { kind: "unavailable", reason: "stale" } }));

    expect(unknown.pricing).toEqual({ kind: "unavailable", reason: "not-provided" });
    expect(stale.pricing).toEqual({ kind: "unavailable", reason: "stale" });
    expect(JSON.stringify(stale)).not.toContain("cost");
  });

  it("rejects malformed usage, raw payload fields, and mismatched budget evidence", () => {
    expect(() => createUsageReceipt(input({ usage: { inputTokens: -1 } }))).toThrow(
      "Usage receipt attribution, usage, and budget evidence must agree.",
    );
    expect(() =>
      createUsageReceipt({
        ...input(),
        pricing: {
          kind: "unavailable",
          reason: "unverified-source",
          nativePayload: "must-not-leak",
        },
      } as unknown as UsageReceiptInput),
    ).toThrow("Usage receipt attribution, usage, and budget evidence must agree.");
    expect(() =>
      createUsageReceipt(
        input({
          usage: { inputTokens: 1 },
        }),
      ),
    ).toThrow("Usage receipt attribution, usage, and budget evidence must agree.");
    expect(() =>
      createUsageReceipt(
        input({
          usage: { inputTokens: 1 },
          attribution: { kind: "partial", source: "provider", missing: ["outputTokens"] },
        }),
      ),
    ).toThrow("Usage receipt attribution, usage, and budget evidence must agree.");
    expect(() =>
      createUsageReceipt(
        input({
          budgetDecision: createBudgetDecisionEvidence({
            evidenceId: BUDGET_ID,
            invocation: {
              invocationId: coreId<InvocationId>("0190bd0c-0000-7000-8000-000000000096"),
            },
            decidedAt: "2026-08-01T06:59:00.000Z",
            phase: "post-completion",
            decision: "overrun",
            limit: "cost",
          }),
        }),
      ),
    ).toThrow("Usage receipt attribution, usage, and budget evidence must agree.");
  });

  it("rejects mutable or malformed resolved identities before they become evidence", () => {
    const mutable = {
      model: modelRef("example.chat"),
      provider: providerRef("example-provider"),
      deployment: deploymentRef("production"),
      profileId: modelProfileId("example.chat.production"),
      profileVersion: contractVersion("1.0.0"),
    };
    const identity = createResolvedModelIdentity(mutable);
    mutable.profileVersion = contractVersion("2.0.0");

    expect(identity.profileVersion).toBe(contractVersion("1.0.0"));
    expect(() =>
      createResolvedModelIdentity({
        ...identity,
        profileVersion: "not-a-version" as unknown as typeof identity.profileVersion,
      }),
    ).toThrow("Resolved model identity");
  });

  it("records actual model-response usage without copying provider-native metadata", () => {
    const model = createBuiltinModel();
    const receipt = createObservedModelUsageReceipt({
      receiptId: RECEIPT_ID,
      observedAt: "2026-08-01T07:00:00.000Z",
      model,
      context: { invocationId: INVOCATION_ID, runId: RUN_ID, stepId: STEP_ID },
      response: {
        kind: "completion",
        content: [],
        finishReason: "stop",
        usage: { inputTokens: 9, outputTokens: 3, totalTokens: 12 },
        metadata: {
          requestId: "provider-request-42",
          extensions: nativeExtensions({ "example.provider": { marker: "native-only" } }),
        },
      },
      source: "adapter",
    });

    expect(receipt.resolvedModel.profileId).toBe(model.profile.profileId);
    expect(receipt.providerRequestId).toBe("provider-request-42");
    expect(receipt.usage).toEqual({ inputTokens: 9, outputTokens: 3, totalTokens: 12 });
    expect(receipt.attribution).toEqual({
      kind: "partial",
      source: "adapter",
      missing: ["reasoningTokens", "cachedInputTokens"],
    });
    expect(JSON.stringify(receipt)).not.toContain("native-only");
  });

  it("records an explicit unavailable attribution when a model response has no usage", () => {
    const receipt = createObservedModelUsageReceipt({
      receiptId: RECEIPT_ID,
      observedAt: "2026-08-01T07:00:00.000Z",
      model: createBuiltinModel(),
      context: { invocationId: INVOCATION_ID },
      response: {
        kind: "error",
        error: { code: "provider-error", message: "not copied to evidence" },
      },
      source: "provider",
    });

    expect(receipt.attribution).toEqual({ kind: "unavailable", reason: "not-reported" });
    expect(receipt.usage).toBeUndefined();
    expect(JSON.stringify(receipt)).not.toContain("not copied to evidence");
  });
});
