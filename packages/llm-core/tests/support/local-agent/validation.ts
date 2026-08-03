/** Test-only TypeScript runner validation. */
import {
  isCanonicalUuid,
  isContractVersion,
  isExternalId,
  isJsonValue,
  isSpanId,
  isTraceFlags,
  isTraceId,
} from "#contracts";
import type { AgentCancellationRequest } from "../../../src/features/agent/public";
import {
  isPreparedAgentDefinition,
  type AgentEvent,
  type AgentEventKind,
  type AgentStartRequest,
} from "../../../src/features/agent/public";
import { isRegisteredResumableCheckpoint } from "../../../src/features/state/runtime";
import type { LocalAgentExecutionResult } from "./types";

const INVOCATION_KEYS = new Set([
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
]);

const BUDGET_KEYS = new Set([
  "maxModelCalls",
  "maxToolCalls",
  "maxInputTokens",
  "maxOutputTokens",
  "maxTotalTokens",
  "maxDurationMs",
  "maxCost",
]);
const SAFE_CODE = /^[a-z][a-z0-9._-]{0,127}$/;
const ACTION_DIGEST = /^[A-Za-z0-9_-]{43}$/;
const INTERVENTION_DECISIONS = new Set(["approve", "deny", "defer", "edit", "cancel", "escalate"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const hasOnlyKeys = (value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean =>
  Object.keys(value).every((key) => allowed.has(key));

const exactRef = (value: unknown, key: string): boolean =>
  isRecord(value) &&
  Object.keys(value).length === 1 &&
  Object.hasOwn(value, key) &&
  isExternalId(value[key]);

const isActionDigest = (value: unknown): boolean =>
  isRecord(value) &&
  Object.keys(value).sort().join(",") === "algorithm,keyRef,value" &&
  value.algorithm === "hmac-sha-256" &&
  exactRef(value.keyRef, "secretId") &&
  typeof value.value === "string" &&
  ACTION_DIGEST.test(value.value);

export const isCanonicalTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const isCostLimit = (value: unknown): boolean =>
  isRecord(value) &&
  Object.keys(value).sort().join(",") === "currency,minorUnits" &&
  typeof value.currency === "string" &&
  /^[A-Z]{3}$/.test(value.currency) &&
  typeof value.minorUnits === "string" &&
  /^(?:0|[1-9]\d*)$/.test(value.minorUnits);

const isInvocationLimit = (value: unknown): boolean =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isBudget = (value: unknown): boolean => {
  if (!isRecord(value) || !hasOnlyKeys(value, BUDGET_KEYS)) {
    return false;
  }
  return Object.entries(value).every(([key, entry]) =>
    key === "maxCost" ? isCostLimit(entry) : isInvocationLimit(entry),
  );
};

const hasValidInvocationIdentity = (value: AgentStartRequest["invocationContext"]): boolean =>
  isCanonicalUuid(value.invocationId) &&
  (value.runId === undefined || isCanonicalUuid(value.runId)) &&
  (value.stepId === undefined || isCanonicalUuid(value.stepId)) &&
  (value.toolCallId === undefined || isCanonicalUuid(value.toolCallId)) &&
  (value.conversationId === undefined || isCanonicalUuid(value.conversationId)) &&
  (value.correlationId === undefined || isExternalId(value.correlationId));

const hasValidInvocationAuthority = (value: AgentStartRequest["invocationContext"]): boolean =>
  (value.principal === undefined || exactRef(value.principal, "principalId")) &&
  (value.tenant === undefined || exactRef(value.tenant, "tenantId")) &&
  (value.delegationChain === undefined ||
    (Array.isArray(value.delegationChain) &&
      value.delegationChain.every((entry) => exactRef(entry, "principalId")))) &&
  (value.secretRefs === undefined ||
    (Array.isArray(value.secretRefs) &&
      value.secretRefs.every((entry) => exactRef(entry, "secretId"))));

const hasValidTrace = (value: AgentStartRequest["invocationContext"]["trace"]): boolean =>
  value === undefined ||
  (isRecord(value) &&
    hasOnlyKeys(value, new Set(["traceId", "spanId", "traceFlags"])) &&
    isTraceId(value.traceId) &&
    isSpanId(value.spanId) &&
    (value.traceFlags === undefined || isTraceFlags(value.traceFlags)));

const isClosedInvocationContext = (value: AgentStartRequest["invocationContext"]): boolean =>
  isRecord(value) &&
  isJsonValue(value) &&
  hasOnlyKeys(value, INVOCATION_KEYS) &&
  hasValidInvocationIdentity(value) &&
  hasValidInvocationAuthority(value) &&
  hasValidTrace(value.trace) &&
  (value.deadlineAt === undefined || isCanonicalTimestamp(value.deadlineAt)) &&
  (value.budget === undefined || isBudget(value.budget));

export const isClosedProviderSession = (value: unknown): boolean =>
  isRecord(value) &&
  Object.keys(value).sort().join(",") === "kind,providerId,sessionId" &&
  value.kind === "provider-session-ref" &&
  isExternalId(value.providerId) &&
  isExternalId(value.sessionId);

export const isClosedDurableExecution = (value: unknown): boolean =>
  isRecord(value) &&
  Object.keys(value).sort().join(",") === "durableJobId,kind,opaqueHandle,runtime" &&
  value.kind === "durable-execution-handle" &&
  isCanonicalUuid(value.durableJobId) &&
  isExternalId(value.opaqueHandle) &&
  isRecord(value.runtime) &&
  Object.keys(value.runtime).sort().join(",") === "runtimeId,runtimeVersion" &&
  isExternalId(value.runtime.runtimeId) &&
  isContractVersion(value.runtime.runtimeVersion);

export const validateAgentStartRequest = (request: AgentStartRequest): void => {
  if (
    !isPreparedAgentDefinition(request.agent) ||
    !isClosedInvocationContext(request.invocationContext) ||
    !isJsonValue(request.input) ||
    (request.providerSession !== undefined && !isClosedProviderSession(request.providerSession))
  ) {
    throw new TypeError("AgentStartRequest must contain prepared, closed portable values.");
  }
};

export const validateAgentCancellationRequest = (request: AgentCancellationRequest): void => {
  if (
    !isRecord(request) ||
    !hasOnlyKeys(request, new Set(["requestedAt", "reason"])) ||
    !isCanonicalTimestamp(request.requestedAt) ||
    (request.reason !== undefined && typeof request.reason !== "string")
  ) {
    throw new TypeError("Agent cancellation requests require a closed, safe control shape.");
  }
};

export const validateAgentEventFacts = (kind: AgentEventKind, facts: AgentEvent["facts"]): void => {
  if (!isRecord(facts)) {
    throw new TypeError("Agent run event facts must use a closed safe projection.");
  }
  const value: Record<string, unknown> = facts;
  let valid = false;
  switch (kind) {
    case "agent.run.started":
      valid =
        Object.keys(value).sort().join(",") === "agentId,agentVersion" &&
        isExternalId(value.agentId) &&
        isContractVersion(value.agentVersion);
      break;
    case "agent.run.progress":
      valid =
        Object.keys(value).join(",") === "code" &&
        typeof value.code === "string" &&
        SAFE_CODE.test(value.code);
      break;
    case "agent.run.intervention.requested":
      valid =
        Object.keys(value).sort().join(",") ===
          "actionDigest,allowed,checkpointId,checkpointRevision,expiresAt,interventionId,requestedAt,runId,stepId" &&
        isCanonicalUuid(value.interventionId) &&
        isCanonicalUuid(value.checkpointId) &&
        typeof value.checkpointRevision === "number" &&
        Number.isSafeInteger(value.checkpointRevision) &&
        value.checkpointRevision >= 0 &&
        isCanonicalUuid(value.runId) &&
        isCanonicalUuid(value.stepId) &&
        isActionDigest(value.actionDigest) &&
        isCanonicalTimestamp(value.requestedAt) &&
        isCanonicalTimestamp(value.expiresAt) &&
        Date.parse(value.requestedAt) < Date.parse(value.expiresAt) &&
        Array.isArray(value.allowed) &&
        value.allowed.length > 0 &&
        new Set(value.allowed).size === value.allowed.length &&
        value.allowed.every((entry) => INTERVENTION_DECISIONS.has(String(entry)));
      break;
    case "agent.run.intervention.received":
      valid =
        Object.keys(value).sort().join(",") === "decision,interventionId" &&
        ["approve", "deny", "defer", "edit", "cancel", "escalate"].includes(
          String(value.decision),
        ) &&
        isCanonicalUuid(value.interventionId);
      break;
    case "agent.run.cancellation.requested":
      valid =
        Object.keys(value).sort().join(",") === "reasonProvided,requestedAt" &&
        isCanonicalTimestamp(value.requestedAt) &&
        typeof value.reasonProvided === "boolean";
      break;
    case "agent.run.cancellation.acknowledged":
      valid =
        Object.keys(value).join(",") === "acknowledgedAt" &&
        isCanonicalTimestamp(value.acknowledgedAt);
      break;
    case "agent.run.completed":
    case "agent.run.failed":
    case "agent.run.denied":
    case "agent.run.cancelled": {
      const expected = kind.slice("agent.run.".length);
      valid =
        hasOnlyKeys(value, new Set(["status", "reasonCode"])) &&
        value.status === expected &&
        (value.reasonCode === undefined ||
          (typeof value.reasonCode === "string" && SAFE_CODE.test(value.reasonCode)));
      break;
    }
  }
  if (!valid) {
    throw new TypeError("Agent run event facts must use a closed safe projection.");
  }
};

export const validateLocalAgentExecutionResult = (draft: LocalAgentExecutionResult): void => {
  if (
    !["completed", "failed", "denied", "cancelled"].includes(draft.status) ||
    (draft.output !== undefined && !isJsonValue(draft.output)) ||
    (draft.reasonCode !== undefined && typeof draft.reasonCode !== "string") ||
    (draft.providerSession !== undefined && !isClosedProviderSession(draft.providerSession)) ||
    (draft.checkpoint !== undefined && !isRegisteredResumableCheckpoint(draft.checkpoint)) ||
    (draft.durableExecution !== undefined && !isClosedDurableExecution(draft.durableExecution))
  ) {
    throw new TypeError("Local agent programs must return closed portable run results.");
  }
};
