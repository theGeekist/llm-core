import { isCanonicalUuid, isDigest, isSchemaRef, type ConversationId } from "#contracts";
import { isPortableJsonValue } from "../storage/public";
import type {
  ConversationContentPart,
  ConversationPortableContent,
  ConversationRecord,
  ConversationTurn,
} from "./types";

const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MEDIA_TYPE_PATTERN =
  // eslint-disable-next-line sonarjs/regex-complexity -- mirrors ADR-003's accepted media type syntax
  /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:\s*;\s*[A-Za-z0-9!#$&^_.+-]+=(?:[A-Za-z0-9!#$&^_.+-]+|"[^"]*"))*$/;
const ROLES = new Set(["system", "user", "assistant", "tool"]);

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasOnlyKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key))
  );
};

const isResourceRef = (value: unknown): boolean =>
  isPlainRecord(value) &&
  hasOnlyKeys(value, ["resourceId", "mediaType", "byteLength", "digest"]) &&
  isCanonicalUuid(value.resourceId) &&
  typeof value.mediaType === "string" &&
  MEDIA_TYPE_PATTERN.test(value.mediaType) &&
  Number.isSafeInteger(value.byteLength) &&
  (value.byteLength as number) >= 0 &&
  isDigest(value.digest);

const isPortableContent = (value: unknown): value is ConversationPortableContent => {
  if (!isPlainRecord(value)) {
    return false;
  }
  switch (value.kind) {
    case "text":
      return hasOnlyKeys(value, ["kind", "text"]) && typeof value.text === "string";
    case "json":
      return (
        hasOnlyKeys(value, ["kind", "value"], ["schema"]) &&
        isPortableJsonValue(value.value) &&
        (value.schema === undefined || isSchemaRef(value.schema))
      );
    case "media-ref":
      return (
        hasOnlyKeys(value, ["kind", "mediaType", "resource"], ["altText"]) &&
        typeof value.mediaType === "string" &&
        MEDIA_TYPE_PATTERN.test(value.mediaType) &&
        isResourceRef(value.resource) &&
        (value.altText === undefined || typeof value.altText === "string")
      );
    default:
      return false;
  }
};

const isContentPart = (value: unknown): value is ConversationContentPart => {
  if (isPortableContent(value)) {
    return true;
  }
  if (!isPlainRecord(value)) {
    return false;
  }
  switch (value.kind) {
    case "reasoning":
      return hasOnlyKeys(value, ["kind", "text"]) && typeof value.text === "string";
    case "tool-call":
      return (
        hasOnlyKeys(value, ["kind", "toolCallId", "name", "arguments"]) &&
        isCanonicalUuid(value.toolCallId) &&
        typeof value.name === "string" &&
        value.name.length > 0 &&
        isPortableJsonValue(value.arguments)
      );
    case "tool-result":
      return (
        hasOnlyKeys(value, ["kind", "toolCallId", "result"], ["isError"]) &&
        isCanonicalUuid(value.toolCallId) &&
        Array.isArray(value.result) &&
        value.result.every(isPortableContent) &&
        (value.isError === undefined || typeof value.isError === "boolean")
      );
    default:
      return false;
  }
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

const frozenClone = <T>(value: T): T => deepFreeze(structuredClone(value));

export const conversationId = (value: string): ConversationId => {
  if (!isCanonicalUuid(value)) {
    throw new TypeError("Conversation IDs must be canonical lowercase RFC 9562 UUID strings.");
  }
  return value as ConversationId;
};

export const isConversationTurn = (value: unknown): value is ConversationTurn =>
  isPlainRecord(value) &&
  hasOnlyKeys(value, ["role", "content"], ["occurredAt"]) &&
  ROLES.has(value.role as string) &&
  Array.isArray(value.content) &&
  value.content.length > 0 &&
  value.content.every(isContentPart) &&
  (value.occurredAt === undefined ||
    (typeof value.occurredAt === "string" &&
      TIMESTAMP_PATTERN.test(value.occurredAt) &&
      !Number.isNaN(Date.parse(value.occurredAt))));

export const registerConversationTurn = (value: unknown): ConversationTurn => {
  if (!isConversationTurn(value)) {
    throw new TypeError(
      "Conversation turns must be closed, portable model content without inline bytes.",
    );
  }
  return frozenClone(value);
};

export const isConversationRecord = (value: unknown): value is ConversationRecord =>
  isPlainRecord(value) &&
  hasOnlyKeys(value, ["conversationId", "turns", "revision"]) &&
  isCanonicalUuid(value.conversationId) &&
  Number.isSafeInteger(value.revision) &&
  (value.revision as number) >= 0 &&
  Array.isArray(value.turns) &&
  value.turns.every(isConversationTurn);

export const registerConversationRecord = (value: unknown): ConversationRecord => {
  if (!isConversationRecord(value)) {
    throw new TypeError(
      "Conversation records must be closed portable records with canonical identity.",
    );
  }
  return frozenClone(value);
};
