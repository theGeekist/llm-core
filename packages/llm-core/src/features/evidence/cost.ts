import type { ContractVersion, EvidenceId, EvidenceRef } from "#contracts";
import { isCanonicalUuid, isContractVersion, isExternalId } from "#contracts";
import { cloneFrozen, hasOnlyKeys, isPortableRecord } from "#shared/portable-data";
import { snapshot as snapshotJson } from "@aifsd/strict-json";
import type { ResolvedModelIdentity } from "../model/public";
import {
  areDecimalAmountsEqual,
  isCurrencyCode,
  isDecimalAmount,
  isTimestamp,
  snapshotCostCorrelationRef,
  snapshotCostUsageUnits,
  snapshotEvidenceRef,
  snapshotPriceSource,
  USAGE_METRICS,
  type UsageMetric,
  type CostUsageUnitShape,
} from "./snapshot";
import { createUsageReceipt, type UsageReceipt } from "./usage";

export interface PriceSource {
  readonly sourceId: string;
  readonly sourceVersion: ContractVersion;
  readonly effectiveAt: string;
  readonly currency: string;
}

export interface CostCorrelationRef {
  readonly namespace: string;
  readonly correlationId: string;
}

export type CostUsageUnit = CostUsageUnitShape;

export type CostEstimateDisposition =
  | {
      readonly kind: "estimated";
      readonly priceSource: PriceSource;
      readonly currency: string;
      readonly amount: string;
      readonly assumptions?: readonly string[];
    }
  | {
      readonly kind: "partial";
      readonly priceSource: PriceSource;
      readonly currency: string;
      readonly amount: string;
      readonly missing: readonly UsageMetric[];
      readonly assumptions?: readonly string[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason: "no-pricing" | "stale-pricing" | "incomplete-usage" | "unverified-source";
    };

export interface CostEstimate {
  readonly estimateId: EvidenceId;
  readonly receipt: UsageReceipt;
  readonly estimatedAt: string;
  readonly units: readonly CostUsageUnit[];
  readonly evidenceRef?: EvidenceRef;
  readonly correlation?: CostCorrelationRef;
  readonly disposition: CostEstimateDisposition;
}

export interface ProviderCostRecord {
  readonly providerRecordId: string;
  readonly provider: ResolvedModelIdentity["provider"];
  readonly providerRequestId?: string;
  readonly sourceId: string;
  readonly sourceVersion: ContractVersion;
  readonly evidenceRef: EvidenceRef;
  readonly currency: string;
  readonly amount: string;
  readonly recordedAt: string;
}

export type ReconciledCostDisposition =
  | { readonly kind: "reconciled" }
  | {
      readonly kind: "divergent";
      readonly reason: "amount-mismatch" | "currency-mismatch";
    }
  | {
      readonly kind: "unreconcilable";
      readonly reason: "estimate-unavailable";
    }
  | {
      readonly kind: "unavailable";
      readonly reason: "no-provider-record" | "pending";
    };

export interface ReconciledCost {
  readonly reconciliationId: EvidenceId;
  readonly reconciledAt: string;
  readonly estimate: CostEstimate;
  readonly providerRecord?: ProviderCostRecord;
  readonly disposition: ReconciledCostDisposition;
}

const snapshotAssumptions = (value: unknown): readonly string[] | null => {
  if (!Array.isArray(value)) return null;
  const items: readonly unknown[] = value;
  const assumptions: string[] = [];
  for (let i = 0; i < items.length; i += 1) {
    if (!Object.hasOwn(items, i)) return null;
    const item = items[i];
    if (typeof item !== "string" || item.trim().length === 0) return null;
    assumptions.push(item);
  }
  return assumptions;
};

const snapshotMissingMetrics = (value: unknown): readonly UsageMetric[] | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  const items: readonly unknown[] = value;
  const metrics: UsageMetric[] = [];
  const seen = new Set<UsageMetric>();
  for (let i = 0; i < items.length; i += 1) {
    if (!Object.hasOwn(items, i)) return null;
    const item = items[i];
    if (
      typeof item !== "string" ||
      !USAGE_METRICS.includes(item as UsageMetric) ||
      seen.has(item as UsageMetric)
    ) {
      return null;
    }
    const metric = item as UsageMetric;
    seen.add(metric);
    metrics.push(metric);
  }
  return metrics;
};

const snapshotEstimatedDisposition = (
  value: Record<string, unknown>,
): CostEstimateDisposition | null => {
  if (!hasOnlyKeys(value, ["kind", "priceSource", "currency", "amount"], ["assumptions"])) {
    return null;
  }
  const priceSource = snapshotPriceSource(value.priceSource);
  if (
    priceSource === null ||
    !isCurrencyCode(value.currency) ||
    !isDecimalAmount(value.amount) ||
    priceSource.currency !== value.currency
  ) {
    return null;
  }
  let assumptions: readonly string[] | undefined;
  if (value.assumptions !== undefined) {
    const snapped = snapshotAssumptions(value.assumptions);
    if (snapped === null) return null;
    assumptions = snapped;
  }
  return {
    kind: "estimated",
    priceSource,
    currency: value.currency,
    amount: value.amount,
    ...(assumptions === undefined ? {} : { assumptions }),
  };
};

const snapshotPartialDisposition = (
  value: Record<string, unknown>,
): CostEstimateDisposition | null => {
  if (
    !hasOnlyKeys(value, ["kind", "priceSource", "currency", "amount", "missing"], ["assumptions"])
  ) {
    return null;
  }
  const priceSource = snapshotPriceSource(value.priceSource);
  const missing = snapshotMissingMetrics(value.missing);
  if (
    priceSource === null ||
    missing === null ||
    !isCurrencyCode(value.currency) ||
    !isDecimalAmount(value.amount) ||
    priceSource.currency !== value.currency
  ) {
    return null;
  }
  let assumptions: readonly string[] | undefined;
  if (value.assumptions !== undefined) {
    const snapped = snapshotAssumptions(value.assumptions);
    if (snapped === null) return null;
    assumptions = snapped;
  }
  return {
    kind: "partial",
    priceSource,
    currency: value.currency,
    amount: value.amount,
    missing,
    ...(assumptions === undefined ? {} : { assumptions }),
  };
};

const snapshotUnavailableDisposition = (
  value: Record<string, unknown>,
): CostEstimateDisposition | null => {
  if (
    hasOnlyKeys(value, ["kind", "reason"]) &&
    ["no-pricing", "stale-pricing", "incomplete-usage", "unverified-source"].includes(
      String(value.reason),
    )
  ) {
    return {
      kind: "unavailable",
      reason: value.reason as
        | "no-pricing"
        | "stale-pricing"
        | "incomplete-usage"
        | "unverified-source",
    };
  }
  return null;
};

const snapshotCostEstimateDisposition = (value: unknown): CostEstimateDisposition | null => {
  if (!isPortableRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "estimated") return snapshotEstimatedDisposition(value);
  if (value.kind === "partial") return snapshotPartialDisposition(value);
  if (value.kind === "unavailable") return snapshotUnavailableDisposition(value);
  return null;
};

const snapshotProviderCostRecord = (value: unknown): ProviderCostRecord | null => {
  const evidenceRef = isPortableRecord(value) ? snapshotEvidenceRef(value.evidenceRef) : null;
  if (
    !isPortableRecord(value) ||
    !hasOnlyKeys(
      value,
      [
        "providerRecordId",
        "provider",
        "sourceId",
        "sourceVersion",
        "evidenceRef",
        "currency",
        "amount",
        "recordedAt",
      ],
      ["providerRequestId"],
    ) ||
    !isExternalId(value.providerRecordId) ||
    !isExternalId(value.provider) ||
    (value.providerRequestId !== undefined && !isExternalId(value.providerRequestId)) ||
    !isExternalId(value.sourceId) ||
    !isContractVersion(value.sourceVersion) ||
    evidenceRef === null ||
    !isCurrencyCode(value.currency) ||
    !isDecimalAmount(value.amount) ||
    !isTimestamp(value.recordedAt)
  ) {
    return null;
  }
  return {
    providerRecordId: value.providerRecordId,
    provider: value.provider as ResolvedModelIdentity["provider"],
    ...(value.providerRequestId === undefined
      ? {}
      : { providerRequestId: value.providerRequestId }),
    sourceId: value.sourceId,
    sourceVersion: value.sourceVersion,
    evidenceRef,
    currency: value.currency,
    amount: value.amount,
    recordedAt: value.recordedAt,
  };
};

/**
 * Purely derive the reconciliation disposition from an immutable cost estimate
 * and an authoritative provider record.
 */
function assertValidCostEstimateInput(input: unknown): asserts input is CostEstimate {
  if (
    !isPortableRecord(input) ||
    !hasOnlyKeys(
      input,
      ["estimateId", "receipt", "estimatedAt", "units", "disposition"],
      ["evidenceRef", "correlation"],
    ) ||
    !isCanonicalUuid(input.estimateId) ||
    !isTimestamp(input.estimatedAt)
  ) {
    throw new TypeError(
      "Cost estimates require closed, portable evidence with valid identifiers and timestamps.",
    );
  }
}

const costUnitsMatchReceipt = (
  receipt: UsageReceipt,
  units: readonly CostUsageUnit[],
  disposition: CostEstimateDisposition,
): boolean => {
  const usage = receipt.usage;
  if (usage === undefined) {
    return (
      units.length === 0 &&
      disposition.kind === "unavailable" &&
      disposition.reason === "incomplete-usage"
    );
  }
  return units.length > 0 && units.every(({ metric, quantity }) => usage[metric] === quantity);
};

/**
 * Snapshot a cost estimate as an immutable, portable evidence record.
 *
 * Unavailable estimates carry no money, amount, currency, or verified price source.
 * Estimates record source version, effective time, assumptions, and disposition;
 * they cannot deserialize as charges or billing authority.
 */
export const createCostEstimate = (input: CostEstimate): CostEstimate => {
  const candidate = snapshotJson(input);
  assertValidCostEstimateInput(candidate);

  const receipt = createUsageReceipt(candidate.receipt);
  const units = snapshotCostUsageUnits(candidate.units);
  const disposition = snapshotCostEstimateDisposition(candidate.disposition);

  if (units === null || disposition === null) {
    throw new TypeError("Cost estimate units and disposition must be valid portable records.");
  }
  if (!costUnitsMatchReceipt(receipt, units, disposition)) {
    throw new TypeError(
      "Cost estimate units and incomplete-usage disposition must match the cited usage receipt.",
    );
  }

  let evidenceRef: EvidenceRef | undefined;
  if (candidate.evidenceRef !== undefined) {
    const snappedRef = snapshotEvidenceRef(candidate.evidenceRef);
    if (snappedRef === null) {
      throw new TypeError("Cost estimate evidenceRef must be a valid portable EvidenceRef.");
    }
    evidenceRef = snappedRef;
  }

  let correlation: CostCorrelationRef | undefined;
  if (candidate.correlation !== undefined) {
    const snappedCorrelation = snapshotCostCorrelationRef(candidate.correlation);
    if (snappedCorrelation === null) {
      throw new TypeError("Cost estimate correlation must be a valid CostCorrelationRef.");
    }
    correlation = snappedCorrelation;
  }

  return cloneFrozen({
    estimateId: candidate.estimateId,
    receipt,
    estimatedAt: candidate.estimatedAt,
    units,
    disposition,
    ...(evidenceRef === undefined ? {} : { evidenceRef }),
    ...(correlation === undefined ? {} : { correlation }),
  });
};

const assertCompatibleProviderIdentity = (
  estimate: CostEstimate,
  providerRecord?: ProviderCostRecord,
): void => {
  if (providerRecord === undefined) return;
  if (
    estimate.receipt.resolvedModel.provider !== providerRecord.provider ||
    (estimate.receipt.providerRequestId !== undefined &&
      providerRecord.providerRequestId !== undefined &&
      estimate.receipt.providerRequestId !== providerRecord.providerRequestId)
  ) {
    throw new TypeError(
      "Contradictory provider or providerRequestId between cost estimate and provider record is an identity error.",
    );
  }
};

/**
 * Purely derive the reconciliation disposition from an immutable cost estimate
 * and an authoritative provider record.
 */
export const deriveReconciliationDisposition = (
  estimate: CostEstimate,
  providerRecord?: ProviderCostRecord,
): ReconciledCostDisposition => {
  assertCompatibleProviderIdentity(estimate, providerRecord);
  if (providerRecord === undefined) {
    return { kind: "unavailable", reason: "no-provider-record" };
  }

  if (estimate.disposition.kind === "unavailable") {
    return { kind: "unreconcilable", reason: "estimate-unavailable" };
  }

  if (estimate.disposition.currency !== providerRecord.currency) {
    return { kind: "divergent", reason: "currency-mismatch" };
  }

  if (!areDecimalAmountsEqual(estimate.disposition.amount, providerRecord.amount)) {
    return { kind: "divergent", reason: "amount-mismatch" };
  }

  return { kind: "reconciled" };
};

const snapshotReconciledCostDisposition = (value: unknown): ReconciledCostDisposition | null => {
  if (!isPortableRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "reconciled" && hasOnlyKeys(value, ["kind"])) {
    return { kind: "reconciled" };
  }
  if (
    value.kind === "divergent" &&
    hasOnlyKeys(value, ["kind", "reason"]) &&
    (value.reason === "amount-mismatch" || value.reason === "currency-mismatch")
  ) {
    return { kind: "divergent", reason: value.reason };
  }
  if (
    value.kind === "unreconcilable" &&
    hasOnlyKeys(value, ["kind", "reason"]) &&
    value.reason === "estimate-unavailable"
  ) {
    return { kind: "unreconcilable", reason: value.reason };
  }
  if (
    value.kind === "unavailable" &&
    hasOnlyKeys(value, ["kind", "reason"]) &&
    (value.reason === "no-provider-record" || value.reason === "pending")
  ) {
    return { kind: "unavailable", reason: value.reason };
  }
  return null;
};

const assertValidReconciledDisposition = (
  disposition: ReconciledCostDisposition,
  estimate: CostEstimate,
  providerRecord?: ProviderCostRecord,
): void => {
  if (providerRecord === undefined) {
    if (disposition.kind !== "unavailable") {
      throw new TypeError(
        "Reconciled cost without a provider record requires an unavailable disposition with no-provider-record or pending reason.",
      );
    }
    return;
  }

  if (disposition.kind === "unavailable") {
    throw new TypeError(
      "Reconciled cost with an authoritative provider record cannot have unavailable disposition.",
    );
  }

  const expected = deriveReconciliationDisposition(estimate, providerRecord);
  if (disposition.kind !== expected.kind) {
    throw new TypeError(
      `Reconciled cost disposition (${disposition.kind}) does not match derived disposition (${expected.kind}).`,
    );
  }
  if (
    "reason" in expected &&
    (disposition as { readonly reason?: string }).reason !== expected.reason
  ) {
    throw new TypeError(
      `Reconciled cost divergence reason does not match derived reason (${expected.reason}).`,
    );
  }
};

/**
 * Snapshot a reconciled cost as an immutable, portable evidence record.
 *
 * Preserves both the complete estimate and the provider record. Presence of the
 * provider record is biconditional with reconciled, divergent, and unreconcilable
 * dispositions. A contradictory providerRequestId throws as an identity error.
 */
export const createReconciledCost = (input: ReconciledCost): ReconciledCost => {
  const candidate = snapshotJson(input);
  if (
    !isPortableRecord(candidate) ||
    !hasOnlyKeys(
      candidate,
      ["reconciliationId", "reconciledAt", "estimate", "disposition"],
      ["providerRecord"],
    ) ||
    !isCanonicalUuid(candidate.reconciliationId) ||
    !isTimestamp(candidate.reconciledAt)
  ) {
    throw new TypeError(
      "Reconciled costs require closed, portable evidence with valid identifiers and timestamps.",
    );
  }

  const estimate = createCostEstimate(candidate.estimate as unknown as CostEstimate);

  let providerRecord: ProviderCostRecord | undefined;
  if (candidate.providerRecord !== undefined) {
    const snappedProviderRecord = snapshotProviderCostRecord(candidate.providerRecord);
    if (snappedProviderRecord === null) {
      throw new TypeError("Reconciled cost providerRecord must be a valid ProviderCostRecord.");
    }
    providerRecord = snappedProviderRecord;
  }

  const disposition = snapshotReconciledCostDisposition(candidate.disposition);
  if (disposition === null) {
    throw new TypeError("Reconciled cost disposition must be a closed portable record.");
  }
  assertCompatibleProviderIdentity(estimate, providerRecord);
  assertValidReconciledDisposition(disposition, estimate, providerRecord);

  return cloneFrozen({
    reconciliationId: candidate.reconciliationId as EvidenceId,
    reconciledAt: candidate.reconciledAt,
    estimate,
    ...(providerRecord === undefined ? {} : { providerRecord }),
    disposition,
  });
};
