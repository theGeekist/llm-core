import { isJsonValue, type JsonValue } from "#contracts";

export interface PydanticAiNativeRunObservation {
  readonly runtime: "pydantic-ai";
  readonly runtimeVersion: "2.19.0";
  readonly native: {
    readonly output: string;
    readonly toolNames: readonly ["echo"];
    readonly messageHistory: readonly JsonValue[];
  };
}

type JsonRecord = Record<string, JsonValue>;

const record = (value: JsonValue | undefined): JsonRecord | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value : undefined;

const hasExactKeys = (value: JsonRecord, expected: readonly string[]): boolean => {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every((key) => expected.includes(key));
};

const isTimestamp = (value: JsonValue | undefined): value is string =>
  typeof value === "string" && value.endsWith("Z") && !Number.isNaN(Date.parse(value));

const isIdentity = (value: JsonValue | undefined): value is string =>
  typeof value === "string" && value.length > 0;

const isUsage = (value: JsonValue | undefined): boolean => {
  const usage = record(value);
  const details = record(usage?.details);
  if (
    !usage ||
    !details ||
    !hasExactKeys(usage, [
      "cache_audio_read_tokens",
      "cache_read_tokens",
      "cache_write_tokens",
      "details",
      "input_audio_tokens",
      "input_tokens",
      "output_audio_tokens",
      "output_tokens",
    ]) ||
    Object.keys(details).length !== 0
  ) {
    return false;
  }
  return Object.entries(usage).every(
    ([key, item]) =>
      key === "details" || (typeof item === "number" && Number.isSafeInteger(item) && item >= 0),
  );
};

const isUserPrompt = (value: JsonValue): value is JsonRecord => {
  const part = record(value);
  return Boolean(
    part &&
      hasExactKeys(part, ["content", "part_kind", "timestamp"]) &&
      part.part_kind === "user-prompt" &&
      typeof part.content === "string" &&
      isTimestamp(part.timestamp),
  );
};

const isToolCall = (value: JsonValue): value is JsonRecord => {
  const part = record(value);
  const args = record(part?.args);
  return Boolean(
    part &&
      args &&
      hasExactKeys(part, [
        "args",
        "id",
        "part_kind",
        "provider_details",
        "provider_name",
        "tool_call_id",
        "tool_kind",
        "tool_name",
      ]) &&
      hasExactKeys(args, ["value"]) &&
      part.part_kind === "tool-call" &&
      part.id === null &&
      part.provider_details === null &&
      part.provider_name === null &&
      part.tool_kind === null &&
      part.tool_name === "echo" &&
      isIdentity(part.tool_call_id) &&
      typeof args.value === "string",
  );
};

const isToolReturn = (value: JsonValue): value is JsonRecord => {
  const part = record(value);
  return Boolean(
    part &&
      hasExactKeys(part, [
        "content",
        "metadata",
        "outcome",
        "part_kind",
        "timestamp",
        "tool_call_id",
        "tool_kind",
        "tool_name",
      ]) &&
      part.part_kind === "tool-return" &&
      part.metadata === null &&
      part.outcome === "success" &&
      part.tool_kind === null &&
      part.tool_name === "echo" &&
      isIdentity(part.tool_call_id) &&
      isTimestamp(part.timestamp) &&
      typeof part.content === "string",
  );
};

const isTextPart = (value: JsonValue): value is JsonRecord => {
  const part = record(value);
  return Boolean(
    part &&
      hasExactKeys(part, ["content", "id", "part_kind", "provider_details", "provider_name"]) &&
      part.part_kind === "text" &&
      part.id === null &&
      part.provider_details === null &&
      part.provider_name === null &&
      typeof part.content === "string",
  );
};

const isRequest = (value: JsonValue): value is JsonRecord => {
  const message = record(value);
  return Boolean(
    message &&
      hasExactKeys(message, [
        "conversation_id",
        "instructions",
        "kind",
        "metadata",
        "parts",
        "run_id",
        "state",
        "timestamp",
      ]) &&
      message.kind === "request" &&
      message.metadata === null &&
      message.state === "complete" &&
      isIdentity(message.conversation_id) &&
      isIdentity(message.run_id) &&
      typeof message.instructions === "string" &&
      isTimestamp(message.timestamp) &&
      Array.isArray(message.parts),
  );
};

const isResponse = (value: JsonValue): value is JsonRecord => {
  const message = record(value);
  return Boolean(
    message &&
      hasExactKeys(message, [
        "conversation_id",
        "finish_reason",
        "kind",
        "metadata",
        "model_name",
        "parts",
        "provider_details",
        "provider_name",
        "provider_response_id",
        "provider_url",
        "run_id",
        "state",
        "timestamp",
        "usage",
      ]) &&
      message.kind === "response" &&
      message.finish_reason === null &&
      message.metadata === null &&
      message.model_name === "test" &&
      message.provider_details === null &&
      message.provider_name === "test" &&
      message.provider_response_id === null &&
      message.provider_url === null &&
      message.state === "complete" &&
      isIdentity(message.conversation_id) &&
      isIdentity(message.run_id) &&
      isTimestamp(message.timestamp) &&
      Array.isArray(message.parts) &&
      isUsage(message.usage),
  );
};

const isExactHistory = (history: readonly JsonValue[], output: string): boolean => {
  if (
    history.length !== 4 ||
    !isRequest(history[0]!) ||
    !isResponse(history[1]!) ||
    !isRequest(history[2]!) ||
    !isResponse(history[3]!)
  ) {
    return false;
  }
  const [promptParts, callParts, returnParts, textParts] = history.map(
    (message) => record(message)!.parts,
  );
  if (
    !Array.isArray(promptParts) ||
    promptParts.length !== 1 ||
    !isUserPrompt(promptParts[0]!) ||
    !Array.isArray(callParts) ||
    callParts.length !== 1 ||
    !isToolCall(callParts[0]!) ||
    !Array.isArray(returnParts) ||
    returnParts.length !== 1 ||
    !isToolReturn(returnParts[0]!) ||
    !Array.isArray(textParts) ||
    textParts.length !== 1 ||
    !isTextPart(textParts[0]!)
  ) {
    return false;
  }
  const messages = history.map((message) => record(message)!);
  const call = record(callParts[0])!;
  const args = record(call.args)!;
  const returned = record(returnParts[0])!;
  const text = record(textParts[0])!;
  return (
    messages.every((message) => message.conversation_id === messages[0]!.conversation_id) &&
    messages.every((message) => message.run_id === messages[0]!.run_id) &&
    messages[0]!.instructions === messages[2]!.instructions &&
    call.tool_call_id === returned.tool_call_id &&
    call.tool_name === returned.tool_name &&
    args.value === returned.content &&
    text.content === output
  );
};

export const isPydanticAiNativeRunObservation = (value: JsonValue): boolean => {
  if (!isJsonValue(value)) {
    return false;
  }
  const observation = record(value);
  const native = record(observation?.native);
  return Boolean(
    observation &&
      native &&
      hasExactKeys(observation, ["native", "runtime", "runtimeVersion"]) &&
      hasExactKeys(native, ["messageHistory", "output", "toolNames"]) &&
      observation.runtime === "pydantic-ai" &&
      observation.runtimeVersion === "2.19.0" &&
      typeof native.output === "string" &&
      Array.isArray(native.toolNames) &&
      native.toolNames.length === 1 &&
      native.toolNames[0] === "echo" &&
      Array.isArray(native.messageHistory) &&
      isExactHistory(native.messageHistory, native.output),
  );
};
