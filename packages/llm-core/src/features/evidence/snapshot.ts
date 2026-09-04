import {
  isCanonicalUuid,
  isContractVersion,
  isDigest,
  isExternalId,
  isSchemaRef,
  type ContractVersion,
  type EvidenceId,
  type EvidenceKind,
  type EvidenceRef,
  type InvocationId,
  type ResourceId,
  type ResourceRef,
  type RunId,
  type StepId,
} from "#contracts";
import { hasOnlyKeys, isPortableRecord } from "#shared/portable-data";
import type { ModelUsage, ResolvedModelIdentity } from "../model/public";

export const USAGE_METRICS = [
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "reasoningTokens",
  "cachedInputTokens",
] as const;

export type UsageMetric = (typeof USAGE_METRICS)[number];

export interface UsageInvocation {
  readonly invocationId: InvocationId;
  readonly runId?: RunId;
  readonly stepId?: StepId;
}

export interface CostUsageUnitShape {
  readonly metric: UsageMetric;
  readonly quantity: number;
}

export const isTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
};

export const snapshotDenseArray = (value: unknown): readonly unknown[] | null => {
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

const ISO_4217 = /^[A-Z]{3}$/;

export const isCurrencyCode = (value: unknown): value is string =>
  typeof value === "string" && ISO_4217.test(value);

export const isDecimalAmount = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length === 0) return false;
  return /^-?\d+(\.\d+)?$/.test(value);
};

export const normalizeDecimalAmount = (value: string): string => {
  const isNegative = value.startsWith("-");
  const unsigned = isNegative ? value.slice(1) : value;
  const [intPart = "0", fracPart = ""] = unsigned.split(".");
  const normInt = intPart.replace(/^0+/, "") || "0";
  let normFrac = fracPart;
  while (normFrac.endsWith("0")) {
    normFrac = normFrac.slice(0, -1);
  }
  if (normInt === "0" && normFrac === "") {
    return "0";
  }
  const combined = normFrac.length > 0 ? `${normInt}.${normFrac}` : normInt;
  return isNegative ? `-${combined}` : combined;
};

export const areDecimalAmountsEqual = (a: string, b: string): boolean =>
  normalizeDecimalAmount(a) === normalizeDecimalAmount(b);

export const snapshotInvocation = (value: unknown): UsageInvocation | null => {
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

export const snapshotResolvedModel = (value: unknown): ResolvedModelIdentity | null => {
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

export const snapshotUsage = (value: unknown): ModelUsage | null => {
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

export const snapshotCostUsageUnits = (value: unknown): readonly CostUsageUnitShape[] | null => {
  const items = snapshotDenseArray(value);
  if (items === null) return null;

  const units: CostUsageUnitShape[] = [];
  const seen = new Set<UsageMetric>();
  for (const item of items) {
    if (
      !isPortableRecord(item) ||
      !hasOnlyKeys(item, ["metric", "quantity"]) ||
      typeof item.metric !== "string" ||
      !USAGE_METRICS.includes(item.metric as UsageMetric) ||
      typeof item.quantity !== "number" ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 0 ||
      seen.has(item.metric as UsageMetric)
    ) {
      return null;
    }
    const metric = item.metric as UsageMetric;
    seen.add(metric);
    units.push({ metric, quantity: item.quantity });
  }
  return units;
};

const MEDIA_TYPE_TOKEN = /^[A-Za-z0-9!#$&^_.+-]+$/;
const MEDIA_TYPE_PARAMETERS =
  /^(?:\s*;\s*[A-Za-z0-9!#$&^_.+-]+=(?:[A-Za-z0-9!#$&^_.+-]+|"[^"]*"))*$/;

const isMediaType = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const slashIndex = value.indexOf("/");
  const parameterIndex = value.indexOf(";", slashIndex + 1);
  const subtypeEnd = parameterIndex < 0 ? value.length : parameterIndex;
  const rawSubtype = value.slice(slashIndex + 1, subtypeEnd);
  const subtype = parameterIndex < 0 ? rawSubtype : rawSubtype.trimEnd();
  const parameters = parameterIndex < 0 ? "" : value.slice(parameterIndex);
  return (
    slashIndex > 0 &&
    MEDIA_TYPE_TOKEN.test(value.slice(0, slashIndex)) &&
    MEDIA_TYPE_TOKEN.test(subtype) &&
    MEDIA_TYPE_PARAMETERS.test(parameters)
  );
};

const EVIDENCE_KINDS = [
  "artifact",
  "checkpoint",
  "evaluation",
  "event-payload",
  "execution-receipt",
  "other",
  "tool-arguments",
  "tool-result",
] as const;

export const snapshotResourceRef = (value: unknown): ResourceRef | null => {
  if (
    !isPortableRecord(value) ||
    !hasOnlyKeys(value, ["resourceId", "mediaType", "byteLength", "digest"]) ||
    !isCanonicalUuid(value.resourceId) ||
    !isMediaType(value.mediaType) ||
    typeof value.byteLength !== "number" ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength < 0 ||
    !isDigest(value.digest)
  ) {
    return null;
  }
  return {
    resourceId: value.resourceId as ResourceId,
    mediaType: value.mediaType,
    byteLength: value.byteLength,
    digest: value.digest,
  };
};

export const snapshotEvidenceRef = (value: unknown): EvidenceRef | null => {
  if (
    !isPortableRecord(value) ||
    !hasOnlyKeys(value, ["evidenceId", "kind", "content"], ["schema"]) ||
    !isCanonicalUuid(value.evidenceId) ||
    typeof value.kind !== "string" ||
    !EVIDENCE_KINDS.includes(value.kind as (typeof EVIDENCE_KINDS)[number])
  ) {
    return null;
  }
  const content = snapshotResourceRef(value.content);
  if (content === null) return null;
  if (value.schema !== undefined && !isSchemaRef(value.schema)) return null;
  return {
    evidenceId: value.evidenceId as EvidenceId,
    kind: value.kind as EvidenceKind,
    content,
    ...(value.schema === undefined ? {} : { schema: value.schema }),
  };
};

export interface PriceSourceShape {
  readonly sourceId: string;
  readonly sourceVersion: ContractVersion;
  readonly effectiveAt: string;
  readonly currency: string;
}

export const snapshotPriceSource = (value: unknown): PriceSourceShape | null => {
  if (
    !isPortableRecord(value) ||
    !hasOnlyKeys(value, ["sourceId", "sourceVersion", "effectiveAt", "currency"]) ||
    !isExternalId(value.sourceId) ||
    !isContractVersion(value.sourceVersion) ||
    !isTimestamp(value.effectiveAt) ||
    !isCurrencyCode(value.currency)
  ) {
    return null;
  }
  return {
    sourceId: value.sourceId,
    sourceVersion: value.sourceVersion,
    effectiveAt: value.effectiveAt,
    currency: value.currency,
  };
};

export interface CostCorrelationRefShape {
  readonly namespace: string;
  readonly correlationId: string;
}

export const snapshotCostCorrelationRef = (value: unknown): CostCorrelationRefShape | null => {
  if (
    !isPortableRecord(value) ||
    !hasOnlyKeys(value, ["namespace", "correlationId"]) ||
    typeof value.namespace !== "string" ||
    value.namespace.length === 0 ||
    typeof value.correlationId !== "string" ||
    value.correlationId.length === 0
  ) {
    return null;
  }
  return {
    namespace: value.namespace,
    correlationId: value.correlationId,
  };
};
