import {
  coreId,
  isCanonicalUuid,
  isExternalId,
  type EventId,
  type RunId,
} from "#contracts";
import type { InteractionUiEvent } from "./types";
import {
  isCanonicalInteractionTimestamp,
  isSafeInteractionCode,
  isSafeInteractionProjectionJson,
} from "./content-registration";

const TERMINAL_STATUSES = ["completed", "failed", "denied", "cancelled"] as const;
const RECEIPT_STATES = [
  "reserved",
  "awaiting_policy",
  "awaiting_approval",
  "ready",
  "started",
  "denied",
  "expired",
  "cancelled_before_start",
  "succeeded",
  "failed_after_start",
  "indeterminate",
  "reconciliation_required",
  "compensation_required",
  "compensating",
  "compensated",
  "compensation_failed",
] as const;
const INTERVENTION_DECISIONS = [
  "approve",
  "deny",
  "defer",
  "edit",
  "cancel",
  "escalate",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`Conversation snapshot ${field} must be a non-empty string.`);
  }
  return value;
};

const requiredExternalId = (value: unknown, field: string): string => {
  if (!isExternalId(value)) {
    throw new TypeError(`Conversation snapshot ${field} must be an opaque external ID.`);
  }
  return value;
};

const requiredSafeCode = (value: unknown, field: string): string => {
  if (!isSafeInteractionCode(value)) {
    throw new TypeError(`Conversation snapshot ${field} must be a safe code.`);
  }
  return value;
};

const requiredTimestamp = (value: unknown, field: string): string => {
  if (!isCanonicalInteractionTimestamp(value)) {
    throw new TypeError(`Conversation snapshot ${field} must be a canonical timestamp.`);
  }
  return value;
};

const canonicalId = (value: unknown, field: string): string => {
  if (!isCanonicalUuid(value)) {
    throw new TypeError(`Conversation snapshot ${field} must be a canonical UUID.`);
  }
  return value;
};

const commonIdentity = (
  value: Record<string, unknown>,
): { eventId: EventId; runId: RunId } => ({
  eventId: coreId<EventId>(canonicalId(value.eventId, "eventId")),
  runId: coreId<RunId>(canonicalId(value.runId, "runId")),
});

const optionalReason = (value: unknown): string | null =>
  value === undefined ? null : requiredSafeCode(value, "reasonCode");

const allowedDecisions = (value: unknown): readonly string[] => {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    new Set(value).size !== value.length ||
    !value.every((entry) =>
      INTERVENTION_DECISIONS.includes(
        entry as (typeof INTERVENTION_DECISIONS)[number],
      ),
    )
  ) {
    throw new TypeError("Conversation snapshot intervention decisions must be closed.");
  }
  return [...value] as string[];
};

// eslint-disable-next-line sonarjs/cognitive-complexity -- registers one exhaustive closed UI event union
export const registerInteractionUiEvent = (value: unknown): InteractionUiEvent => {
  if (!isRecord(value)) {
    throw new TypeError("Conversation projection events must be closed objects.");
  }
  const kind = requiredString(value.kind, "event kind");
  const common = commonIdentity(value);
  switch (kind) {
    case "run-started":
      if (hasOnlyKeys(value, ["kind", "eventId", "runId", "agentId"])) {
        return { kind, ...common, agentId: requiredExternalId(value.agentId, "agentId") };
      }
      break;
    case "run-progress":
      if (hasOnlyKeys(value, ["kind", "eventId", "runId", "code"])) {
        return { kind, ...common, code: requiredSafeCode(value.code, "progress code") };
      }
      break;
    case "intervention-requested":
      if (
        hasOnlyKeys(value, [
          "kind",
          "eventId",
          "runId",
          "interventionId",
          "allowed",
          "expiresAt",
        ])
      ) {
        return {
          kind,
          ...common,
          interventionId: canonicalId(value.interventionId, "interventionId"),
          allowed: allowedDecisions(value.allowed),
          expiresAt: requiredTimestamp(value.expiresAt, "expiresAt"),
        };
      }
      break;
    case "cancellation-requested":
      if (hasOnlyKeys(value, ["kind", "eventId", "runId"])) {
        return { kind, ...common };
      }
      break;
    case "tool-status": {
      if (
        !hasOnlyKeys(value, [
          "kind",
          "eventId",
          "runId",
          "toolCallId",
          "receiptState",
          "reasonCode",
        ]) ||
        !RECEIPT_STATES.includes(value.receiptState as (typeof RECEIPT_STATES)[number])
      ) {
        break;
      }
      const reasonCode = optionalReason(value.reasonCode);
      return {
        kind,
        ...common,
        toolCallId: canonicalId(value.toolCallId, "toolCallId"),
        receiptState: value.receiptState as (typeof RECEIPT_STATES)[number],
        ...(reasonCode ? { reasonCode } : {}),
      };
    }
    case "run-finished": {
      if (
        !hasOnlyKeys(value, ["kind", "eventId", "runId", "status", "reasonCode"]) ||
        !TERMINAL_STATUSES.includes(value.status as (typeof TERMINAL_STATUSES)[number])
      ) {
        break;
      }
      const reasonCode = optionalReason(value.reasonCode);
      return {
        kind,
        ...common,
        status: value.status as (typeof TERMINAL_STATUSES)[number],
        ...(reasonCode ? { reasonCode } : {}),
      };
    }
    case "message-started":
    case "message-finished":
      if (hasOnlyKeys(value, ["kind", "eventId", "runId", "messageId"])) {
        return {
          kind,
          ...common,
          messageId: requiredExternalId(value.messageId, "messageId"),
        };
      }
      break;
    case "text-delta":
    case "reasoning-delta":
      if (hasOnlyKeys(value, ["kind", "eventId", "runId", "messageId", "text"])) {
        return {
          kind,
          ...common,
          messageId: requiredExternalId(value.messageId, "messageId"),
          text: requiredString(value.text, "projected text"),
        };
      }
      break;
    case "tool-call":
      if (
        hasOnlyKeys(value, [
          "kind",
          "eventId",
          "runId",
          "messageId",
          "toolCallId",
          "toolName",
          "projectedInput",
        ]) &&
        isSafeInteractionProjectionJson(value.projectedInput)
      ) {
        return {
          kind,
          ...common,
          messageId: requiredExternalId(value.messageId, "messageId"),
          toolCallId: requiredExternalId(value.toolCallId, "toolCallId"),
          toolName: requiredExternalId(value.toolName, "toolName"),
          projectedInput: structuredClone(value.projectedInput),
        };
      }
      break;
    case "tool-result":
      if (
        hasOnlyKeys(value, [
          "kind",
          "eventId",
          "runId",
          "messageId",
          "toolCallId",
          "toolName",
          "projectedResult",
          "isError",
        ]) &&
        isSafeInteractionProjectionJson(value.projectedResult) &&
        typeof value.isError === "boolean"
      ) {
        return {
          kind,
          ...common,
          messageId: requiredExternalId(value.messageId, "messageId"),
          toolCallId: requiredExternalId(value.toolCallId, "toolCallId"),
          toolName: requiredExternalId(value.toolName, "toolName"),
          projectedResult: structuredClone(value.projectedResult),
          isError: value.isError,
        };
      }
      break;
    case "message-failed":
      if (
        hasOnlyKeys(value, [
          "kind",
          "eventId",
          "runId",
          "messageId",
          "reasonCode",
        ])
      ) {
        return {
          kind,
          ...common,
          messageId: requiredExternalId(value.messageId, "messageId"),
          reasonCode: requiredSafeCode(value.reasonCode, "reasonCode"),
        };
      }
      break;
  }
  throw new TypeError("Conversation projection events must use a closed safe shape.");
};
