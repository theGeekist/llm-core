import {
  isCanonicalUuid,
  isExternalId,
  isJsonValue,
  isSpanId,
  isTraceFlags,
  isTraceId,
} from "#contracts";
import { hasOnlyKeys, isPortableRecord } from "#shared/portable-data";
import type {
  AgentCancellationRequest,
  AgentDefinition,
  AgentStartRequest,
} from "../../features/agent/public";

const INVOCATION_KEYS = [
  "invocationId",
  "runId",
  "stepId",
  "toolCallId",
  "conversationId",
  "correlationId",
  "principal",
  "tenant",
  "delegationChain",
  "trace",
  "deadlineAt",
  "budget",
  "secretRefs",
] as const;

const BUDGET_KEYS = [
  "maxModelCalls",
  "maxToolCalls",
  "maxInputTokens",
  "maxOutputTokens",
  "maxTotalTokens",
  "maxDurationMs",
  "maxCost",
] as const;

export const isCanonicalTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const exactRef = (value: unknown, key: string): boolean =>
  isPortableRecord(value) && hasOnlyKeys(value, [key]) && isExternalId(value[key]);

const isInvocationLimit = (value: unknown): boolean =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isCostLimit = (value: unknown): boolean =>
  isPortableRecord(value) &&
  hasOnlyKeys(value, ["currency", "minorUnits"]) &&
  typeof value.currency === "string" &&
  /^[A-Z]{3}$/.test(value.currency) &&
  typeof value.minorUnits === "string" &&
  /^(?:0|[1-9]\d*)$/.test(value.minorUnits);

const isBudget = (value: unknown): boolean =>
  isPortableRecord(value) &&
  hasOnlyKeys(value, [], BUDGET_KEYS) &&
  Object.entries(value).every(([key, entry]) =>
    key === "maxCost" ? isCostLimit(entry) : isInvocationLimit(entry),
  );

const isTrace = (value: unknown): boolean =>
  value === undefined ||
  (isPortableRecord(value) &&
    hasOnlyKeys(value, ["traceId", "spanId"], ["traceFlags"]) &&
    isTraceId(value.traceId) &&
    isSpanId(value.spanId) &&
    (value.traceFlags === undefined || isTraceFlags(value.traceFlags)));

const hasValidInvocationIdentity = (value: Record<string, unknown>): boolean =>
  isCanonicalUuid(value.invocationId) &&
  (value.runId === undefined || isCanonicalUuid(value.runId)) &&
  (value.stepId === undefined || isCanonicalUuid(value.stepId)) &&
  (value.toolCallId === undefined || isCanonicalUuid(value.toolCallId)) &&
  (value.conversationId === undefined || isCanonicalUuid(value.conversationId)) &&
  (value.correlationId === undefined || isExternalId(value.correlationId));

const hasValidInvocationAuthority = (value: Record<string, unknown>): boolean =>
  (value.principal === undefined || exactRef(value.principal, "principalId")) &&
  (value.tenant === undefined || exactRef(value.tenant, "tenantId")) &&
  (value.delegationChain === undefined ||
    (Array.isArray(value.delegationChain) &&
      value.delegationChain.every((entry) => exactRef(entry, "principalId")))) &&
  (value.secretRefs === undefined ||
    (Array.isArray(value.secretRefs) &&
      value.secretRefs.every((entry) => exactRef(entry, "secretId"))));

const isInvocationContext = (value: unknown): boolean => {
  if (
    !isPortableRecord(value) ||
    !isJsonValue(value) ||
    !hasOnlyKeys(value, ["invocationId"], INVOCATION_KEYS.slice(1))
  ) {
    return false;
  }
  return (
    hasValidInvocationIdentity(value) &&
    hasValidInvocationAuthority(value) &&
    isTrace(value.trace) &&
    (value.deadlineAt === undefined || isCanonicalTimestamp(value.deadlineAt)) &&
    (value.budget === undefined || isBudget(value.budget))
  );
};

export function validateLangGraphDefinition(value: unknown): asserts value is AgentDefinition {
  if (!isPortableRecord(value) || !isJsonValue(value)) {
    throw new TypeError("LangGraph preparation requires a closed portable definition.");
  }
}

export function validateLangGraphStartRequest(value: unknown): asserts value is AgentStartRequest {
  if (
    !isPortableRecord(value) ||
    !hasOnlyKeys(value, ["agent", "invocationContext", "input"], ["providerSession"]) ||
    !isInvocationContext(value.invocationContext) ||
    !isJsonValue(value.input) ||
    value.providerSession !== undefined
  ) {
    throw new TypeError(
      "LangGraph start requires a closed invocation, portable input, and no provider session.",
    );
  }
}

export function validateLangGraphCancellation(
  value: unknown,
): asserts value is AgentCancellationRequest {
  if (
    !isPortableRecord(value) ||
    !hasOnlyKeys(value, ["requestedAt"], ["reason"]) ||
    !isCanonicalTimestamp(value.requestedAt) ||
    (value.reason !== undefined && typeof value.reason !== "string")
  ) {
    throw new TypeError("LangGraph cancellation requires a closed safe control shape.");
  }
}
