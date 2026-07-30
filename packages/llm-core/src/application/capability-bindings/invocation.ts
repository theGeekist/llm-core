import {
  isCanonicalUuid,
  isExternalId,
  isJsonValue,
  isSpanId,
  isTraceFlags,
  isTraceId,
  type InvocationContext,
} from "#contracts";
import { cloneFrozen, hasOnlyKeys, isPortableRecord as isRecord } from "#shared/portable-data";
import {
  createDurableExecutionHandle,
  createProviderSessionRef,
  createSnapshot,
  isLiveContinuation,
  isRegisteredResumableCheckpoint,
  type DurableExecutionHandle,
  type LiveContinuation,
  type ProviderSessionRef,
  type RegisteredResumableCheckpoint,
  type Snapshot,
} from "../../features/state/public";

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

const exactRef = (value: unknown, key: string): boolean =>
  isRecord(value) &&
  Object.keys(value).length === 1 &&
  Object.hasOwn(value, key) &&
  isExternalId(value[key]);

const isCanonicalTimestamp = (value: unknown): value is string =>
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

const isBudget = (value: unknown): boolean =>
  isRecord(value) &&
  hasOnlyKeys(value, [], [...BUDGET_KEYS]) &&
  Object.entries(value).every(([key, entry]) =>
    key === "maxCost" ? isCostLimit(entry) : isInvocationLimit(entry),
  );

const hasValidIdentity = (value: InvocationContext): boolean =>
  isCanonicalUuid(value.invocationId) &&
  (value.runId === undefined || isCanonicalUuid(value.runId)) &&
  (value.stepId === undefined || isCanonicalUuid(value.stepId)) &&
  (value.toolCallId === undefined || isCanonicalUuid(value.toolCallId)) &&
  (value.conversationId === undefined || isCanonicalUuid(value.conversationId)) &&
  (value.correlationId === undefined || isExternalId(value.correlationId));

const hasValidAuthority = (value: InvocationContext): boolean =>
  (value.principal === undefined || exactRef(value.principal, "principalId")) &&
  (value.tenant === undefined || exactRef(value.tenant, "tenantId")) &&
  (value.delegationChain === undefined ||
    (Array.isArray(value.delegationChain) &&
      value.delegationChain.every((entry) => exactRef(entry, "principalId")))) &&
  (value.secretRefs === undefined ||
    (Array.isArray(value.secretRefs) &&
      value.secretRefs.every((entry) => exactRef(entry, "secretId"))));

const hasValidTrace = (value: InvocationContext["trace"]): boolean =>
  value === undefined ||
  (isRecord(value) &&
    hasOnlyKeys(value, ["traceId", "spanId"], ["traceFlags"]) &&
    isTraceId(value.traceId) &&
    isSpanId(value.spanId) &&
    (value.traceFlags === undefined || isTraceFlags(value.traceFlags)));

const isClosedInvocationContext = (value: unknown): value is InvocationContext =>
  isRecord(value) &&
  isJsonValue(value) &&
  hasOnlyKeys(
    value,
    ["invocationId"],
    [...INVOCATION_KEYS].filter((key) => key !== "invocationId"),
  ) &&
  hasValidIdentity(value as unknown as InvocationContext) &&
  hasValidAuthority(value as unknown as InvocationContext) &&
  hasValidTrace((value as unknown as InvocationContext).trace) &&
  (value.deadlineAt === undefined || isCanonicalTimestamp(value.deadlineAt)) &&
  (value.budget === undefined || isBudget(value.budget));

export type CapabilityInvocationState =
  | { readonly kind: "active" }
  | { readonly kind: "paused-live"; readonly continuation: LiveContinuation<unknown> }
  | { readonly kind: "paused-snapshot"; readonly snapshot: Snapshot }
  | {
      readonly kind: "resume-checkpoint";
      readonly checkpoint: RegisteredResumableCheckpoint;
    }
  | {
      readonly kind: "continue-provider-session";
      readonly session: ProviderSessionRef;
    }
  | {
      readonly kind: "signal-durable-execution";
      readonly handle: DurableExecutionHandle;
    };

export interface CapabilityInvocation {
  readonly invocationContext: InvocationContext;
  readonly state: CapabilityInvocationState;
}

// The closed state union is intentionally validated in one exhaustive boundary.
// eslint-disable-next-line sonarjs/cognitive-complexity
const registerState = (value: CapabilityInvocationState | undefined): CapabilityInvocationState => {
  if (value === undefined) {
    return Object.freeze({ kind: "active" });
  }
  const candidate: unknown = value;
  if (!isRecord(candidate) || typeof candidate.kind !== "string") {
    throw new TypeError("Capability invocation state must use a typed state lifetime.");
  }
  switch (candidate.kind) {
    case "active":
      if (Object.keys(candidate).length === 1) {
        return Object.freeze({ kind: "active" });
      }
      break;
    case "paused-live":
      if (
        Object.keys(candidate).sort().join(",") === "continuation,kind" &&
        isLiveContinuation(candidate.continuation)
      ) {
        return Object.freeze({
          kind: "paused-live",
          continuation: candidate.continuation,
        });
      }
      break;
    case "paused-snapshot":
      if (
        Object.keys(candidate).sort().join(",") === "kind,snapshot" &&
        isRecord(candidate.snapshot) &&
        Object.keys(candidate.snapshot).every((key) =>
          ["kind", "snapshotId", "createdAt", "schema", "value"].includes(key),
        ) &&
        candidate.snapshot.kind === "snapshot"
      ) {
        const snapshot = candidate.snapshot;
        return Object.freeze({
          kind: "paused-snapshot",
          snapshot: createSnapshot({
            snapshotId: snapshot.snapshotId as string,
            createdAt: snapshot.createdAt as string,
            ...(snapshot.schema === undefined
              ? {}
              : { schema: snapshot.schema as Snapshot["schema"] }),
            value: snapshot.value as Snapshot["value"],
          }),
        });
      }
      break;
    case "resume-checkpoint":
      if (
        Object.keys(candidate).sort().join(",") === "checkpoint,kind" &&
        isRegisteredResumableCheckpoint(candidate.checkpoint)
      ) {
        return Object.freeze({
          kind: "resume-checkpoint",
          checkpoint: candidate.checkpoint,
        });
      }
      break;
    case "continue-provider-session":
      if (
        Object.keys(candidate).sort().join(",") === "kind,session" &&
        isRecord(candidate.session) &&
        Object.keys(candidate.session).sort().join(",") === "kind,providerId,sessionId"
      ) {
        return Object.freeze({
          kind: "continue-provider-session",
          session: createProviderSessionRef(candidate.session as unknown as ProviderSessionRef),
        });
      }
      break;
    case "signal-durable-execution":
      if (
        Object.keys(candidate).sort().join(",") === "handle,kind" &&
        isRecord(candidate.handle) &&
        Object.keys(candidate.handle).sort().join(",") ===
          "durableJobId,kind,opaqueHandle,runtime" &&
        isRecord(candidate.handle.runtime) &&
        Object.keys(candidate.handle.runtime).sort().join(",") === "runtimeId,runtimeVersion"
      ) {
        return Object.freeze({
          kind: "signal-durable-execution",
          handle: createDurableExecutionHandle(
            candidate.handle as unknown as DurableExecutionHandle,
          ),
        });
      }
      break;
  }
  throw new TypeError("Capability invocation state must use a typed state lifetime.");
};

export const registerCapabilityInvocation = (input: {
  readonly invocationContext: InvocationContext;
  readonly state?: CapabilityInvocationState;
}): CapabilityInvocation => {
  const candidate: unknown = input;
  if (
    !isRecord(candidate) ||
    !hasOnlyKeys(candidate, ["invocationContext"], ["state"]) ||
    !Object.hasOwn(candidate, "invocationContext") ||
    !isClosedInvocationContext(candidate.invocationContext)
  ) {
    throw new TypeError("Capability invocation requires a closed InvocationContext.");
  }
  return Object.freeze({
    invocationContext: cloneFrozen(candidate.invocationContext),
    state: registerState(candidate.state as CapabilityInvocationState | undefined),
  });
};
