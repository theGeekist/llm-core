import type { MaybePromise } from "#shared/maybe";
import type { CostEstimate, CostUsageUnit, PriceSource, ProviderCostRecord } from "./cost";
import type { UsageReceipt, UsageMetric } from "./usage";

// ---------------------------------------------------------------------------
// Host-owned price and reconciliation ports
// ---------------------------------------------------------------------------

/**
 * The outcome of resolving a price fact from a host catalogue or pricing model.
 *
 * Catalogues, exchange rates, and pricing tables belong to the host.
 * The kernel receives and snapshots the result without owning billing policy.
 */
export type PriceFactResult =
  | {
      readonly kind: "priced";
      readonly priceSource: PriceSource;
      readonly currency: string;
      readonly amount: string;
      readonly units: readonly CostUsageUnit[];
      readonly assumptions?: readonly string[];
    }
  | {
      readonly kind: "partial";
      readonly priceSource: PriceSource;
      readonly currency: string;
      readonly amount: string;
      readonly units: readonly CostUsageUnit[];
      readonly missing: readonly UsageMetric[];
      readonly assumptions?: readonly string[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason: "no-pricing" | "stale-pricing" | "incomplete-usage" | "unverified-source";
    };

/**
 * Host-owned port for resolving price facts from an observed usage receipt.
 */
export interface PriceFactPort {
  resolve(receipt: UsageReceipt, requestedCurrency: string): MaybePromise<PriceFactResult>;
}

/**
 * The outcome of querying an authoritative provider for a billing or usage record.
 */
export type ProviderReconciliationResult =
  | {
      readonly kind: "recorded";
      readonly record: ProviderCostRecord;
    }
  | {
      readonly kind: "unavailable";
      readonly reason: "no-provider-record" | "pending";
    };

/**
 * Host-owned port for querying authoritative provider billing records for an estimate.
 */
export interface ProviderCostReconciliationPort {
  reconcile(estimate: CostEstimate): MaybePromise<ProviderReconciliationResult>;
}
