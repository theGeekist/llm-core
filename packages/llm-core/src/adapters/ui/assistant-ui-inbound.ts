import {
  isCanonicalUuid,
  isExternalId,
  isJsonValue,
  type EventId,
  type JsonValue,
  type RunId,
} from "#contracts";
import {
  registerInteractionContentEvent,
  type RegisteredInteractionContentEvent,
} from "../../application/interaction/public";
import type { RedactionMetadata } from "../../features/evidence/public";

interface RedactedText {
  readonly text: string;
  readonly redaction: RedactionMetadata;
}

interface RedactedJson {
  readonly value: JsonValue;
  readonly redaction: RedactionMetadata;
}

export interface AssistantUiInboundContext {
  readonly runId: RunId;
  readonly newEventId: () => EventId;
  readonly newMessageId: () => string;
  readonly now: () => string;
  readonly initialSequence?: number;
  readonly redactText: (text: string) => RedactedText;
  readonly projectToolResult: (value: JsonValue) => RedactedJson;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validRedaction = (value: unknown): value is RedactionMetadata =>
  isRecord(value) &&
  (value.kind === "not-required" ||
    ((value.kind === "redacted" || value.kind === "evidence-only") &&
      Array.isArray(value.categories) &&
      value.categories.length > 0));

const parseTextParts = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const text: string[] = [];
  for (const part of value) {
    if (!isRecord(part) || part.type !== "text" || typeof part.text !== "string") return null;
    if (part.text.length > 0) text.push(part.text);
  }
  return text.length > 0 ? text : null;
};

const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));

// The parser is intentionally one closed validation boundary: splitting command
// validation across permissive intermediate shapes would allow unregistered
// framework-native data to escape into the application layer.
/* eslint-disable sonarjs/cognitive-complexity */
export const parseAssistantUiInboundEvents = (
  value: unknown,
  context: AssistantUiInboundContext,
): readonly RegisteredInteractionContentEvent[] | null => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["commands", "data"]) ||
    !Array.isArray(value.commands) ||
    !isCanonicalUuid(context.runId) ||
    (context.initialSequence !== undefined &&
      (!Number.isSafeInteger(context.initialSequence) || context.initialSequence < 0))
  ) {
    return null;
  }
  let sequence = context.initialSequence ?? 0;
  const events: RegisteredInteractionContentEvent[] = [];
  const register = (
    kind:
      | "interaction.message.started"
      | "interaction.message.text.delta"
      | "interaction.message.completed"
      | "interaction.message.tool.result",
    facts: JsonValue,
    redaction: RedactionMetadata,
  ): boolean => {
    const eventId = context.newEventId();
    const occurredAt = context.now();
    if (!isCanonicalUuid(eventId) || !validRedaction(redaction)) return false;
    try {
      events.push(
        registerInteractionContentEvent({
          eventId,
          kind,
          occurredAt,
          sequence,
          runId: context.runId,
          facts,
          redaction,
        }),
      );
      sequence += 1;
      return true;
    } catch {
      return false;
    }
  };

  for (const command of value.commands) {
    if (!isRecord(command) || typeof command.type !== "string") return null;
    if (command.type === "add-message") {
      if (!hasOnlyKeys(command, ["type", "message"]) || !isRecord(command.message)) return null;
      if (
        !hasOnlyKeys(command.message, ["role", "parts"]) ||
        (command.message.role !== "user" && command.message.role !== "assistant")
      )
        return null;
      const parts = parseTextParts(command.message.parts);
      const messageId = context.newMessageId();
      if (!parts || !isExternalId(messageId)) return null;
      if (!register("interaction.message.started", { messageId }, { kind: "not-required" }))
        return null;
      for (const source of parts) {
        const projected = context.redactText(source);
        if (
          !projected ||
          typeof projected.text !== "string" ||
          projected.text.length === 0 ||
          !register(
            "interaction.message.text.delta",
            { messageId, text: projected.text },
            projected.redaction,
          )
        )
          return null;
      }
      if (!register("interaction.message.completed", { messageId }, { kind: "not-required" }))
        return null;
      continue;
    }
    if (command.type === "add-tool-result") {
      if (
        !hasOnlyKeys(command, [
          "type",
          "toolCallId",
          "toolName",
          "result",
          "isError",
          "artifact",
        ]) ||
        !isExternalId(command.toolCallId) ||
        !isExternalId(command.toolName) ||
        typeof command.isError !== "boolean" ||
        !isJsonValue(command.result) ||
        command.artifact !== undefined
      )
        return null;
      const projected = context.projectToolResult(command.result);
      const messageId = context.newMessageId();
      if (
        !projected ||
        !isJsonValue(projected.value) ||
        !isExternalId(messageId) ||
        !register(
          "interaction.message.tool.result",
          {
            messageId,
            toolCallId: command.toolCallId,
            toolName: command.toolName,
            projectedResult: projected.value,
            isError: command.isError,
          },
          projected.redaction,
        )
      )
        return null;
      continue;
    }
    return null;
  }
  return Object.freeze(events);
};
/* eslint-enable sonarjs/cognitive-complexity */
