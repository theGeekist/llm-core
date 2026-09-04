import { isCanonicalUuid, type EvidenceId } from "#contracts";
import { cloneFrozen, hasOnlyKeys, isPortableRecord } from "#shared/portable-data";
import { snapshot as snapshotJson } from "@aifsd/strict-json";
import type { ModelUsage } from "../model/public";
import { isTimestamp, snapshotUsage } from "./snapshot";
import { createUsageReceipt, type UsageReceipt } from "./usage";

// ---------------------------------------------------------------------------
// Cache reuse and avoided usage facts (Zero money/charge semantics)
// ---------------------------------------------------------------------------

export type AvoidedUsageDisposition =
  | {
      readonly kind: "estimated";
      readonly basis: "prior-observed-usage" | "declared-baseline";
      readonly usage: ModelUsage;
    }
  | {
      readonly kind: "unavailable";
      readonly reason: "no-baseline" | "not-measurable";
    };

export type CacheAttribution =
  | { readonly kind: "not-applicable" }
  | { readonly kind: "miss" }
  | {
      readonly kind: "reuse";
      readonly avoidedUsage: AvoidedUsageDisposition;
    };

/**
 * An immutable portable record of cache attribution and avoided usage.
 *
 * It distinguishes actual model invocation, reused output, and estimated
 * avoided usage. It carries NO monetary amounts, rates, or charge semantics.
 */
export interface CacheAttributionRecord {
  readonly cacheAttributionId: EvidenceId;
  readonly receipt: UsageReceipt;
  readonly observedAt: string;
  readonly attribution: CacheAttribution;
}

const snapshotAvoidedUsage = (value: unknown): AvoidedUsageDisposition | null => {
  if (!isPortableRecord(value) || typeof value.kind !== "string") return null;

  if (
    value.kind === "estimated" &&
    hasOnlyKeys(value, ["kind", "basis", "usage"]) &&
    (value.basis === "prior-observed-usage" || value.basis === "declared-baseline")
  ) {
    const usage = snapshotUsage(value.usage);
    if (usage === null) return null;
    return {
      kind: "estimated",
      basis: value.basis,
      usage,
    };
  }

  if (
    value.kind === "unavailable" &&
    hasOnlyKeys(value, ["kind", "reason"]) &&
    (value.reason === "no-baseline" || value.reason === "not-measurable")
  ) {
    return {
      kind: "unavailable",
      reason: value.reason,
    };
  }

  return null;
};

const snapshotCacheAttribution = (value: unknown): CacheAttribution | null => {
  if (!isPortableRecord(value) || typeof value.kind !== "string") return null;

  if (value.kind === "not-applicable" && hasOnlyKeys(value, ["kind"])) {
    return { kind: "not-applicable" };
  }

  if (value.kind === "miss" && hasOnlyKeys(value, ["kind"])) {
    return { kind: "miss" };
  }

  if (value.kind === "reuse" && hasOnlyKeys(value, ["kind", "avoidedUsage"])) {
    const avoidedUsage = snapshotAvoidedUsage(value.avoidedUsage);
    if (avoidedUsage === null) return null;
    return {
      kind: "reuse",
      avoidedUsage,
    };
  }

  return null;
};

/**
 * Snapshot a cache attribution record as an immutable, portable evidence record.
 *
 * A cache miss structurally cannot carry avoided usage. Avoided usage is always
 * an explicit estimate or unavailable fact, never an observed usage fact and
 * never an inferred zero. No monetary fields are accepted.
 */
export const createCacheAttributionRecord = (
  input: CacheAttributionRecord,
): CacheAttributionRecord => {
  const candidate = snapshotJson(input);
  if (
    !isPortableRecord(candidate) ||
    !hasOnlyKeys(candidate, ["cacheAttributionId", "receipt", "observedAt", "attribution"]) ||
    !isCanonicalUuid(candidate.cacheAttributionId) ||
    !isTimestamp(candidate.observedAt)
  ) {
    throw new TypeError(
      "Cache attribution records require closed portable evidence with valid identifiers and timestamps.",
    );
  }

  const receipt = createUsageReceipt(candidate.receipt as unknown as UsageReceipt);
  const attribution = snapshotCacheAttribution(candidate.attribution);

  if (attribution === null) {
    throw new TypeError("Cache attribution disposition must be a valid portable record.");
  }

  return cloneFrozen({
    cacheAttributionId: candidate.cacheAttributionId as EvidenceId,
    receipt,
    observedAt: candidate.observedAt,
    attribution,
  });
};
