import {
  isCanonicalUuid,
  isContractVersion,
  isExternalId,
  type EvidenceId,
  type InvocationContext,
  type InvocationId,
  type RunId,
  type StepId,
} from "#contracts";
import { cloneFrozen, hasOnlyKeys, isPortableRecord } from "#shared/portable-data";
import {
  resolvedModelIdentityFromProfile,
  type Model,
  type ModelResponse,
  type ModelUsage,
  type ResolvedModelIdentity,
} from "../model/public";
import type { RedactionCategory, RedactionMetadata } from "./redaction";

export interface UsageInvocation {
  readonly invocationId: InvocationId;
  readonly runId?: RunId;
  readonly stepId?: StepId;
}

export type UsageMetric = keyof ModelUsage;

export type UsageAttributionDisposition =
  | {
      readonly kind: "attributed";
      readonly source: "provider" | "adapter";
    }
  | {
      readonly kind: "partial";
      readonly source: "provider" | "adapter";
      readonly missing: readonly UsageMetric[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason: "not-reported" | "not-applicable" | "redacted";
    };

/**
 * Pricing is intentionally unavailable in this slice. Cost facts exist as a
 * separate record family (CostEstimate, ReconciledCost) and must not reinterpret
 * a usage receipt as cost or charge facts; an observed usage fact must not guess a cost.
 */
export interface UnavailableUsagePricing {
  readonly kind: "unavailable";
  readonly reason: "not-provided" | "stale" | "unverified-source";
}

export type UsagePricingDisposition = UnavailableUsagePricing;

export type BudgetDecisionPhase = "pre-dispatch" | "mid-run" | "post-completion";
export type BudgetDecision = "allow" | "warn" | "stop" | "overrun";
export type BudgetLimit =
  | "model-calls"
  | "input-tokens"
  | "output-tokens"
  | "total-tokens"
  | "duration"
  | "cost";

/**
 * A portable record of a composition-owned budget decision.
 *
 * The record does not implement a budget controller or infer a monetary value;
 * it states what the controlling composition decided for a known invocation.
 */
export interface BudgetDecisionEvidence {
  readonly evidenceId: EvidenceId;
  readonly invocation: UsageInvocation;
  readonly decidedAt: string;
  readonly phase: BudgetDecisionPhase;
  readonly decision: BudgetDecision;
  readonly limit: BudgetLimit;
}

export interface UsageReceipt {
  readonly receiptId: EvidenceId;
  readonly invocation: UsageInvocation;
  readonly observedAt: string;
  readonly resolvedModel: ResolvedModelIdentity;
  readonly providerRequestId?: string;
  readonly usage?: ModelUsage;
  readonly attribution: UsageAttributionDisposition;
  readonly pricing: UsagePricingDisposition;
  readonly redaction: RedactionMetadata;
  readonly budgetDecision?: BudgetDecisionEvidence;
}

export type UsageReceiptInput = UsageReceipt;

export interface CreateObservedModelUsageReceiptInput {
  readonly receiptId: EvidenceId;
  readonly observedAt: string;
  readonly model: Model;
  readonly context: Pick<InvocationContext, "invocationId" | "runId" | "stepId">;
  readonly response: ModelResponse;
  readonly source: "provider" | "adapter";
  readonly pricing?: UsagePricingDisposition;
  readonly redaction?: RedactionMetadata;
  readonly budgetDecision?: BudgetDecisionEvidence;
}

const USAGE_METRICS = [
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "reasoningTokens",
  "cachedInputTokens",
] as const satisfies readonly UsageMetric[];

const REDACTION_CATEGORIES = [
  "arguments",
  "credentials",
  "native-payload",
  "personal-data",
  "result",
] as const satisfies readonly RedactionCategory[];

const isTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
};

const snapshotDenseArray = (value: unknown): readonly unknown[] | null => {
  if (!Array.isArray(value)) return null;
  const keys = Reflect.ownKeys(value);
  const length = value.length;
  if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1) return null;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor?.value !== length ||
    "get" in lengthDescriptor ||
    "set" in lengthDescriptor
  ) {
    return null;
  }
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor?.enumerable !== true || !("value" in descriptor)) return null;
    snapshot.push(descriptor.value);
  }
  return snapshot;
};

const snapshotInvocation = (value: unknown): UsageInvocation | null => {
  if (
    !isPortableRecord(value) ||
    !hasOnlyKeys(value, ["invocationId"], ["runId", "stepId"]) ||
    !isCanonicalUuid(value.invocationId) ||
    (value.runId !== undefined && !isCanonicalUuid(value.runId)) ||
    (value.stepId !== undefined && !isCanonicalUuid(value.stepId))
  ) {
    return null;
  }
  return {
    invocationId: value.invocationId as InvocationId,
    ...(value.runId === undefined ? {} : { runId: value.runId as RunId }),
    ...(value.stepId === undefined ? {} : { stepId: value.stepId as StepId }),
  };
};

const snapshotResolvedModel = (value: unknown): ResolvedModelIdentity | null => {
  if (
    !isPortableRecord(value) ||
    !hasOnlyKeys(value, ["model", "provider", "deployment", "profileId", "profileVersion"]) ||
    !isExternalId(value.model) ||
    !isExternalId(value.provider) ||
    !isExternalId(value.deployment) ||
    !isExternalId(value.profileId) ||
    !isContractVersion(value.profileVersion)
  ) {
    return null;
  }
  return {
    model: value.model as ResolvedModelIdentity["model"],
    provider: value.provider as ResolvedModelIdentity["provider"],
    deployment: value.deployment as ResolvedModelIdentity["deployment"],
    profileId: value.profileId as ResolvedModelIdentity["profileId"],
    profileVersion: value.profileVersion,
  };
};

const snapshotUsage = (value: unknown): ModelUsage | null => {
  if (!isPortableRecord(value) || !hasOnlyKeys(value, [], USAGE_METRICS)) return null;
  const usage: ModelUsage = {};
  for (const metric of USAGE_METRICS) {
    const amount = value[metric];
    if (amount === undefined) continue;
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) return null;
    usage[metric] = amount;
  }
  return Object.keys(usage).length > 0 ? usage : null;
};

const missingUsageMetrics = (usage: ModelUsage): UsageMetric[] =>
  USAGE_METRICS.filter((metric) => usage[metric] === undefined);

const attributionMatchesUsage = (
  attribution: UsageAttributionDisposition,
  usage: ModelUsage | undefined,
): boolean => {
  if (attribution.kind === "unavailable") return usage === undefined;
  if (usage === undefined) return false;
  const missing = missingUsageMetrics(usage);
  if (attribution.kind === "attributed") return missing.length === 0;
  return (
    attribution.missing.length === missing.length &&
    attribution.missing.every((metric) => missing.includes(metric))
  );
};

const snapshotAttribution = (value: unknown): UsageAttributionDisposition | null => {
  if (!isPortableRecord(value) || typeof value.kind !== "string") return null;
  if (
    value.kind === "attributed" &&
    hasOnlyKeys(value, ["kind", "source"]) &&
    (value.source === "provider" || value.source === "adapter")
  ) {
    return { kind: "attributed", source: value.source };
  }
  if (
    value.kind === "partial" &&
    hasOnlyKeys(value, ["kind", "source", "missing"]) &&
    (value.source === "provider" || value.source === "adapter") &&
    snapshotDenseArray(value.missing) !== null
  ) {
    const missing = snapshotDenseArray(value.missing)!;
    if (
      missing.length === 0 ||
      !missing.every((metric) => USAGE_METRICS.includes(metric as UsageMetric)) ||
      new Set(missing).size !== missing.length
    ) {
      return null;
    }
    return {
      kind: "partial",
      source: value.source,
      missing: missing as UsageMetric[],
    };
  }
  if (
    value.kind === "unavailable" &&
    hasOnlyKeys(value, ["kind", "reason"]) &&
    ["not-reported", "not-applicable", "redacted"].includes(String(value.reason))
  ) {
    return {
      kind: "unavailable",
      reason: value.reason as "not-reported" | "not-applicable" | "redacted",
    };
  }
  return null;
};

const snapshotPricing = (value: unknown): UsagePricingDisposition | null =>
  isPortableRecord(value) &&
  hasOnlyKeys(value, ["kind", "reason"]) &&
  value.kind === "unavailable" &&
  ["not-provided", "stale", "unverified-source"].includes(String(value.reason))
    ? { kind: "unavailable", reason: value.reason as UnavailableUsagePricing["reason"] }
    : null;

const snapshotRedaction = (value: unknown): RedactionMetadata | null => {
  if (!isPortableRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "not-required" && hasOnlyKeys(value, ["kind"])) {
    return { kind: "not-required" };
  }
  if (
    (value.kind === "redacted" || value.kind === "evidence-only") &&
    hasOnlyKeys(value, ["kind", "categories"]) &&
    snapshotDenseArray(value.categories) !== null
  ) {
    const categories = snapshotDenseArray(value.categories)!;
    if (
      categories.length === 0 ||
      !categories.every((category) =>
        REDACTION_CATEGORIES.includes(category as RedactionCategory),
      ) ||
      new Set(categories).size !== categories.length
    ) {
      return null;
    }
    return {
      kind: value.kind,
      categories: categories as RedactionCategory[],
    };
  }
  return null;
};

const sameInvocation = (left: UsageInvocation, right: UsageInvocation): boolean =>
  left.invocationId === right.invocationId &&
  left.runId === right.runId &&
  left.stepId === right.stepId;

const snapshotBudgetDecision = (value: unknown): BudgetDecisionEvidence | null => {
  if (
    !isPortableRecord(value) ||
    !hasOnlyKeys(value, ["evidenceId", "invocation", "decidedAt", "phase", "decision", "limit"]) ||
    !isCanonicalUuid(value.evidenceId) ||
    !isTimestamp(value.decidedAt) ||
    !["pre-dispatch", "mid-run", "post-completion"].includes(String(value.phase)) ||
    !["allow", "warn", "stop", "overrun"].includes(String(value.decision)) ||
    !["model-calls", "input-tokens", "output-tokens", "total-tokens", "duration", "cost"].includes(
      String(value.limit),
    )
  ) {
    return null;
  }
  const invocation = snapshotInvocation(value.invocation);
  return invocation === null
    ? null
    : {
        evidenceId: value.evidenceId as EvidenceId,
        invocation,
        decidedAt: value.decidedAt,
        phase: value.phase as BudgetDecisionPhase,
        decision: value.decision as BudgetDecision,
        limit: value.limit as BudgetLimit,
      };
};

export const createBudgetDecisionEvidence = (
  input: BudgetDecisionEvidence,
): BudgetDecisionEvidence => {
  const decision = snapshotBudgetDecision(input);
  if (decision === null) {
    throw new TypeError("Budget decision evidence must be a closed, attributable portable record.");
  }
  return cloneFrozen(decision);
};

/**
 * Snapshot observed model usage as immutable, redacted portable evidence.
 *
 * No provider-native response, credential, price, estimate, or billing record
 * is representable here. Pricing is deliberately explicit about its absence.
 */
export const createUsageReceipt = (input: UsageReceiptInput): UsageReceipt => {
  if (
    !isPortableRecord(input) ||
    !hasOnlyKeys(
      input,
      [
        "receiptId",
        "invocation",
        "observedAt",
        "resolvedModel",
        "attribution",
        "pricing",
        "redaction",
      ],
      ["providerRequestId", "usage", "budgetDecision"],
    ) ||
    !isCanonicalUuid(input.receiptId) ||
    !isTimestamp(input.observedAt) ||
    (input.providerRequestId !== undefined && !isExternalId(input.providerRequestId))
  ) {
    throw new TypeError("Usage receipts require closed, portable attribution facts.");
  }

  const invocation = snapshotInvocation(input.invocation);
  const resolvedModel = snapshotResolvedModel(input.resolvedModel);
  const attribution = snapshotAttribution(input.attribution);
  const pricing = snapshotPricing(input.pricing);
  const redaction = snapshotRedaction(input.redaction);
  const hasUsage = Object.hasOwn(input, "usage");
  const usage = hasUsage ? snapshotUsage(input.usage) : undefined;
  const hasBudgetDecision = Object.hasOwn(input, "budgetDecision");
  const budgetDecision = hasBudgetDecision
    ? snapshotBudgetDecision(input.budgetDecision)
    : undefined;

  if (
    invocation === null ||
    resolvedModel === null ||
    attribution === null ||
    pricing === null ||
    redaction === null ||
    (hasUsage && usage === null) ||
    (hasBudgetDecision && budgetDecision === null)
  ) {
    throw new TypeError("Usage receipt attribution, usage, and budget evidence must agree.");
  }
  const normalizedUsage = usage ?? undefined;
  const normalizedBudgetDecision = budgetDecision ?? undefined;
  if (
    !attributionMatchesUsage(attribution, normalizedUsage) ||
    (normalizedBudgetDecision !== undefined &&
      !sameInvocation(invocation, normalizedBudgetDecision.invocation))
  ) {
    throw new TypeError("Usage receipt attribution, usage, and budget evidence must agree.");
  }

  return cloneFrozen({
    receiptId: input.receiptId,
    invocation,
    observedAt: input.observedAt,
    resolvedModel,
    ...(input.providerRequestId === undefined
      ? {}
      : { providerRequestId: input.providerRequestId }),
    ...(normalizedUsage === undefined ? {} : { usage: normalizedUsage }),
    attribution,
    pricing,
    redaction,
    ...(normalizedBudgetDecision === undefined ? {} : { budgetDecision: normalizedBudgetDecision }),
  });
};

/**
 * Record the portable usage fact observed from one completed model response.
 *
 * The helper takes a live model only long enough to snapshot its resolved
 * profile identity. It copies no model client, request, content, native
 * metadata, warning, or error value into evidence.
 */
export const createObservedModelUsageReceipt = (
  input: CreateObservedModelUsageReceiptInput,
): UsageReceipt => {
  const usage = input.response.usage;
  const missing = usage === undefined ? [] : missingUsageMetrics(usage);
  return createUsageReceipt({
    receiptId: input.receiptId,
    invocation: {
      invocationId: input.context.invocationId,
      ...(input.context.runId === undefined ? {} : { runId: input.context.runId }),
      ...(input.context.stepId === undefined ? {} : { stepId: input.context.stepId }),
    },
    observedAt: input.observedAt,
    resolvedModel: resolvedModelIdentityFromProfile(input.model.profile),
    ...(input.response.metadata?.requestId === undefined
      ? {}
      : { providerRequestId: input.response.metadata.requestId }),
    ...(usage === undefined ? {} : { usage }),
    attribution:
      usage === undefined
        ? { kind: "unavailable", reason: "not-reported" }
        : missing.length === 0
          ? { kind: "attributed", source: input.source }
          : { kind: "partial", source: input.source, missing },
    pricing: input.pricing ?? { kind: "unavailable", reason: "not-provided" },
    redaction: input.redaction ?? { kind: "not-required" },
    ...(input.budgetDecision === undefined ? {} : { budgetDecision: input.budgetDecision }),
  });
};
