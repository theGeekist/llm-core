import { sha256Evidence } from "./digest";
import type { PortableValue } from "./portable-snapshot";
import { snapshotPortable } from "./portable-snapshot";
import { CodingAgentQualificationError } from "./qualification-error";
import type { CodingAgentNativeEventEvidence } from "./types";
import { exactKeys, record, requiredString } from "./validation";

const MESSAGE_EVENT_KEYS = [
  "id",
  "timestamp",
  "source",
  "parent_id",
  "llm_message",
  "llm_response_id",
  "activated_skills",
  "extended_content",
  "sender",
  "critic_result",
  "kind",
] as const;

const MESSAGE_KEYS = [
  "role",
  "content",
  "tool_calls",
  "tool_call_id",
  "name",
  "reasoning_content",
  "thinking_blocks",
  "responses_reasoning_item",
] as const;

const TEXT_CONTENT_KEYS = ["cache_prompt", "type", "text"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPENHANDS_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/;

interface ExpectedNativeEvent {
  readonly sequence: number;
  readonly source: "user" | "agent";
  readonly role: "user" | "assistant";
  readonly text: string;
}

const expectedEvents: readonly ExpectedNativeEvent[] = Object.freeze([
  Object.freeze({
    sequence: 0,
    source: "user",
    role: "user",
    text: "Apply the governed repository change.",
  }),
  Object.freeze({
    sequence: 1,
    source: "agent",
    role: "assistant",
    text: "The governed repository change is ready.",
  }),
]);

const parseNative = (serialized: string): PortableValue => {
  try {
    return snapshotPortable(JSON.parse(serialized));
  } catch (error) {
    if (error instanceof CodingAgentQualificationError) throw error;
    throw new CodingAgentQualificationError(
      "malformed-native-event",
      "Native MessageEvent serialization is not valid JSON.",
    );
  }
};

const validateTextContent = (value: PortableValue, expected: ExpectedNativeEvent): void => {
  const content = record(value, `nativeEvents[${expected.sequence}].content[0]`);
  exactKeys(content, TEXT_CONTENT_KEYS, `nativeEvents[${expected.sequence}].content[0]`);
  if (content.cache_prompt !== false || content.type !== "text" || content.text !== expected.text) {
    throw new CodingAgentQualificationError(
      "native-event-content-mismatch",
      "Native MessageEvent content does not match the governed fixture.",
    );
  }
};

const validateMessage = (value: PortableValue, expected: ExpectedNativeEvent): void => {
  const message = record(value, `nativeEvents[${expected.sequence}].llm_message`);
  exactKeys(message, MESSAGE_KEYS, `nativeEvents[${expected.sequence}].llm_message`);
  if (
    message.role !== expected.role ||
    !Array.isArray(message.content) ||
    message.content.length !== 1
  ) {
    throw new CodingAgentQualificationError(
      "native-event-role-mismatch",
      "Native MessageEvent role or content cardinality is inconsistent.",
    );
  }
  validateTextContent(message.content[0]!, expected);
};

export const projectPinnedMessageEvent = (
  wrapper: PortableValue,
  expected: ExpectedNativeEvent,
): CodingAgentNativeEventEvidence => {
  const eventWrapper = record(wrapper, `nativeEvents[${expected.sequence}]`);
  exactKeys(
    eventWrapper,
    ["sequence", "nativeType", "source", "serialized"],
    `nativeEvents[${expected.sequence}]`,
  );
  const serialized = requiredString(
    eventWrapper.serialized,
    `nativeEvents[${expected.sequence}].serialized`,
  );
  const native = record(parseNative(serialized), `nativeEvents[${expected.sequence}].serialized`);
  exactKeys(native, MESSAGE_EVENT_KEYS, `nativeEvents[${expected.sequence}].serialized`);
  const eventId = requiredString(native.id, `nativeEvents[${expected.sequence}].id`);
  const occurredAt = requiredString(
    native.timestamp,
    `nativeEvents[${expected.sequence}].timestamp`,
  );
  if (
    eventWrapper.sequence !== expected.sequence ||
    eventWrapper.nativeType !== "MessageEvent" ||
    eventWrapper.source !== native.source ||
    native.kind !== "MessageEvent" ||
    native.source !== expected.source ||
    !UUID.test(eventId) ||
    !OPENHANDS_TIMESTAMP.test(occurredAt)
  ) {
    throw new CodingAgentQualificationError(
      "native-event-correlation-mismatch",
      "Native event type, source, identity or order is inconsistent.",
    );
  }
  validateMessage(native.llm_message!, expected);
  return Object.freeze({
    sequence: expected.sequence,
    nativeType: "MessageEvent",
    source: native.source,
    role: expected.role,
    nativeEventId: eventId,
    occurredAt,
    digest: sha256Evidence(serialized),
    byteLength: Buffer.byteLength(serialized),
  });
};

export const projectPinnedMessageEvents = (
  value: PortableValue,
): readonly CodingAgentNativeEventEvidence[] => {
  if (!Array.isArray(value) || value.length !== expectedEvents.length) {
    throw new CodingAgentQualificationError(
      "malformed-native-events",
      "Exactly two native MessageEvent observations are required.",
    );
  }
  return Object.freeze(
    expectedEvents.map((expected) =>
      projectPinnedMessageEvent(value[expected.sequence]!, expected),
    ),
  );
};
