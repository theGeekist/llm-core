import {
  coreId,
  isCanonicalUuid,
  isExternalId,
  isJsonValue,
  type EventId,
  type JsonValue,
  type RunId,
} from "#contracts";
import type {
  RedactionCategory,
  RedactionMetadata,
} from "../../features/evidence/public";
import type {
  InteractionContentEvent,
  InteractionContentEventKind,
  RegisteredInteractionContentEvent,
} from "./types";

const REDACTION_CATEGORIES = [
  "arguments",
  "credentials",
  "native-payload",
  "personal-data",
  "result",
] as const satisfies readonly RedactionCategory[];
const SAFE_CODE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SENSITIVE_PROJECTION_KEYS = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "cookie",
  "credential",
  "credentials",
  "password",
  "refreshtoken",
  "secret",
  "secretref",
  "secretrefs",
  "signedurl",
]);
const registeredContentEvents = new WeakSet<object>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const externalString = (value: unknown, field: string): string => {
  if (!isExternalId(value)) {
    throw new TypeError(`Interaction content ${field} must be an opaque external ID.`);
  }
  return value;
};

export const isSafeInteractionCode = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 128 && SAFE_CODE.test(value);

export const isCanonicalInteractionTimestamp = (
  value: unknown,
): value is string =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const hasSensitiveProjectionKey = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.some(hasSensitiveProjectionKey);
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(
    ([key, child]) =>
      SENSITIVE_PROJECTION_KEYS.has(key.replaceAll(/[^a-z]/gi, "").toLowerCase()) ||
      hasSensitiveProjectionKey(child),
  );
};

export const isSafeInteractionProjectionJson = (
  value: unknown,
): value is JsonValue =>
  isJsonValue(value) && !hasSensitiveProjectionKey(value);

const safeCode = (value: unknown): string => {
  if (!isSafeInteractionCode(value)) {
    throw new TypeError("Interaction reason codes must use the closed safe-code syntax.");
  }
  return value;
};

const redaction = (value: unknown): RedactionMetadata => {
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw new TypeError("Interaction content requires explicit redaction metadata.");
  }
  if (value.kind === "not-required" && hasOnlyKeys(value, ["kind"])) {
    return { kind: "not-required" };
  }
  if (
    (value.kind === "redacted" || value.kind === "evidence-only") &&
    hasOnlyKeys(value, ["kind", "categories"]) &&
    Array.isArray(value.categories) &&
    value.categories.length > 0 &&
    value.categories.every((category) =>
      REDACTION_CATEGORIES.includes(category as RedactionCategory),
    ) &&
    new Set(value.categories).size === value.categories.length
  ) {
    return {
      kind: value.kind,
      categories: [...value.categories] as RedactionCategory[],
    };
  }
  throw new TypeError("Interaction content redaction metadata must be closed and valid.");
};

const facts = (
  kind: InteractionContentEventKind,
  value: unknown,
): InteractionContentEvent["facts"] => {
  if (!isRecord(value)) {
    throw new TypeError("Interaction content facts must be a closed object.");
  }
  switch (kind) {
    case "interaction.message.started":
    case "interaction.message.completed":
      if (hasOnlyKeys(value, ["messageId"])) {
        return { messageId: externalString(value.messageId, "messageId") };
      }
      break;
    case "interaction.message.text.delta":
    case "interaction.message.reasoning.delta":
      if (
        hasOnlyKeys(value, ["messageId", "text"]) &&
        typeof value.text === "string" &&
        value.text.length > 0
      ) {
        return {
          messageId: externalString(value.messageId, "messageId"),
          text: value.text,
        };
      }
      break;
    case "interaction.message.tool.call":
      if (
        hasOnlyKeys(value, [
          "messageId",
          "toolCallId",
          "toolName",
          "projectedInput",
        ]) &&
        isSafeInteractionProjectionJson(value.projectedInput)
      ) {
        return {
          messageId: externalString(value.messageId, "messageId"),
          toolCallId: externalString(value.toolCallId, "toolCallId"),
          toolName: externalString(value.toolName, "toolName"),
          projectedInput: value.projectedInput,
        };
      }
      break;
    case "interaction.message.tool.result":
      if (
        hasOnlyKeys(value, [
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
          messageId: externalString(value.messageId, "messageId"),
          toolCallId: externalString(value.toolCallId, "toolCallId"),
          toolName: externalString(value.toolName, "toolName"),
          projectedResult: value.projectedResult,
          isError: value.isError,
        };
      }
      break;
    case "interaction.message.failed":
      if (hasOnlyKeys(value, ["messageId", "reasonCode"])) {
        return {
          messageId: externalString(value.messageId, "messageId"),
          reasonCode: safeCode(value.reasonCode),
        };
      }
      break;
  }
  throw new TypeError("Interaction content facts must use the closed canonical shape.");
};

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
};

export const registerInteractionContentEvent = (
  input: unknown,
): RegisteredInteractionContentEvent => {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, [
      "eventId",
      "kind",
      "occurredAt",
      "sequence",
      "runId",
      "facts",
      "redaction",
    ]) ||
    !isCanonicalUuid(input.eventId) ||
    !isCanonicalUuid(input.runId) ||
    typeof input.kind !== "string" ||
    !Number.isSafeInteger(input.sequence) ||
    (input.sequence as number) < 0 ||
    !isCanonicalInteractionTimestamp(input.occurredAt)
  ) {
    throw new TypeError("Interaction content events require canonical identity and ordering.");
  }
  const kind = input.kind as InteractionContentEventKind;
  const event = deepFreeze({
    eventId: coreId<EventId>(input.eventId),
    kind,
    occurredAt: input.occurredAt,
    sequence: input.sequence as number,
    runId: coreId<RunId>(input.runId),
    facts: structuredClone(facts(kind, input.facts)),
    redaction: redaction(input.redaction),
  }) as RegisteredInteractionContentEvent;
  registeredContentEvents.add(event);
  return event;
};

export const isRegisteredInteractionContentEvent = (
  value: unknown,
): value is RegisteredInteractionContentEvent =>
  typeof value === "object" &&
  value !== null &&
  registeredContentEvents.has(value);
