import { isJsonValue, isUuidV7, type JsonValue } from "#contracts";
import type { AgentDefinition, AgentEvent, AgentResult } from "../../features/agent/public";
import { registerAgentOutput } from "../../features/agent/public";
import {
  isPydanticAiNativeRunObservation,
  type PydanticAiNativeRunObservation,
} from "./pydantic-ai-native-result";
import {
  PYDANTIC_AI_BRIDGE_PROTOCOL,
  PYDANTIC_AI_MINIMUM_MINOR,
  PYDANTIC_AI_OPERATIONS,
  PYDANTIC_AI_SUPPORTED_MAJOR,
  type PydanticAiBridgeHandshake,
  type RuntimeOperationDeclaration,
} from "./pydantic-ai-support";

export class PydanticAiCompatibilityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PydanticAiCompatibilityError";
    this.code = code;
  }
}

const parseVersion = (value: string): readonly [number, number, number] | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[+-].*)?$/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

const sameOperationMatrix = (
  actual: readonly RuntimeOperationDeclaration[],
  expected: readonly RuntimeOperationDeclaration[],
): boolean => JSON.stringify(actual) === JSON.stringify(expected);

export const supportedPythonVersion = (value: string): boolean => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[+-].*)?$/.exec(value);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major === 3 && minor >= 10 && minor < 15;
};

export const assertPydanticAiBridgeCompatible = (handshake: PydanticAiBridgeHandshake): void => {
  if (handshake.protocol !== PYDANTIC_AI_BRIDGE_PROTOCOL) {
    throw new PydanticAiCompatibilityError(
      "protocol-mismatch",
      `Expected ${PYDANTIC_AI_BRIDGE_PROTOCOL}.`,
    );
  }
  if (!handshake.pydanticAiAvailable) {
    throw new PydanticAiCompatibilityError(
      "pydantic-ai-unavailable",
      "The Python process is reachable, but PydanticAI is not installed.",
    );
  }
  if (!supportedPythonVersion(handshake.pythonVersion)) {
    throw new PydanticAiCompatibilityError(
      "unsupported-python-version",
      `Python ${handshake.pythonVersion} is outside >=3.10 <3.15.`,
    );
  }
  const version = parseVersion(handshake.pydanticAiVersion);
  if (
    !version ||
    version[0] !== PYDANTIC_AI_SUPPORTED_MAJOR ||
    version[1] !== PYDANTIC_AI_MINIMUM_MINOR ||
    version[2] !== 0
  ) {
    throw new PydanticAiCompatibilityError(
      "unsupported-pydantic-ai-version",
      `PydanticAI ${handshake.pydanticAiVersion} is not the assessed 2.19.0 release.`,
    );
  }
  if (!sameOperationMatrix(handshake.operations, PYDANTIC_AI_OPERATIONS)) {
    throw new PydanticAiCompatibilityError(
      "operation-matrix-mismatch",
      "The Python bridge operation matrix does not match this adapter.",
    );
  }
};

export const clonePortable = <T>(value: T): T => {
  try {
    if (value !== undefined && !isJsonValue(value)) {
      throw new TypeError("not strict JSON data");
    }
    return structuredClone(value);
  } catch {
    throw new PydanticAiCompatibilityError(
      "non-portable-payload",
      "PydanticAI bridge payloads must be structured-cloneable portable values.",
    );
  }
};

export const payloadRecord = (
  value: JsonValue | undefined,
  operation: string,
): Record<string, JsonValue> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PydanticAiCompatibilityError(
      "malformed-response",
      `PydanticAI ${operation} returned a non-object payload.`,
    );
  }
  return value;
};

const hasExactKeys = (value: Record<string, JsonValue>, expected: readonly string[]): boolean => {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every((key) => expected.includes(key));
};

export const stringField = (
  value: JsonValue | undefined,
  field: string,
  operation: string,
): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new PydanticAiCompatibilityError(
      "malformed-response",
      `PydanticAI ${operation} returned an invalid ${field}.`,
    );
  }
  return value;
};

const EVENT_KINDS = new Set<AgentEvent["kind"]>([
  "agent.run.started",
  "agent.run.progress",
  "agent.run.completed",
  "agent.run.failed",
  "agent.run.denied",
  "agent.run.cancelled",
]);

export const TERMINAL_EVENT_KINDS = new Set<AgentEvent["kind"]>([
  "agent.run.completed",
  "agent.run.failed",
  "agent.run.denied",
  "agent.run.cancelled",
]);

const isCanonicalTimestamp = (value: JsonValue | undefined): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
};

const validEventFacts = (kind: AgentEvent["kind"], facts: Record<string, JsonValue>): boolean => {
  switch (kind) {
    case "agent.run.started":
      return (
        hasExactKeys(facts, ["agentId", "agentVersion"]) &&
        typeof facts.agentId === "string" &&
        typeof facts.agentVersion === "string"
      );
    case "agent.run.progress":
      return hasExactKeys(facts, ["code"]) && typeof facts.code === "string";
    case "agent.run.completed":
      return hasExactKeys(facts, ["status"]) && facts.status === "completed";
    case "agent.run.failed":
      return hasExactKeys(facts, ["status"]) && facts.status === "failed";
    case "agent.run.denied":
      return hasExactKeys(facts, ["status"]) && facts.status === "denied";
    case "agent.run.cancelled":
      return hasExactKeys(facts, ["status"]) && facts.status === "cancelled";
    default:
      return false;
  }
};

export const validatePydanticAiEvent = (
  value: JsonValue,
  runId: string,
  expectedSequence: number,
): AgentEvent => {
  if (!isJsonValue(value)) {
    throw new PydanticAiCompatibilityError(
      "malformed-event",
      "PydanticAI emitted an event that is not closed strict JSON data.",
    );
  }
  const record = payloadRecord(value, "events");
  const kind = record.kind as AgentEvent["kind"];
  if (
    !hasExactKeys(record, ["eventId", "kind", "occurredAt", "sequence", "identity", "facts"]) ||
    !isUuidV7(record.eventId) ||
    !EVENT_KINDS.has(kind) ||
    record.sequence !== expectedSequence ||
    !isCanonicalTimestamp(record.occurredAt) ||
    !record.facts ||
    typeof record.facts !== "object" ||
    Array.isArray(record.facts)
  ) {
    throw new PydanticAiCompatibilityError(
      "malformed-event",
      "PydanticAI emitted an unknown, malformed, duplicated, dropped, or reordered event.",
    );
  }
  if (!validEventFacts(kind, record.facts as Record<string, JsonValue>)) {
    throw new PydanticAiCompatibilityError(
      "malformed-event-facts",
      "PydanticAI emitted facts that do not match the portable lifecycle event contract.",
    );
  }
  const identity = payloadRecord(record.identity, "events");
  if (!hasExactKeys(identity, ["runId"]) || identity.runId !== runId) {
    throw new PydanticAiCompatibilityError(
      "event-identity-mismatch",
      "PydanticAI emitted an event for a different run.",
    );
  }
  return clonePortable(record) as unknown as AgentEvent;
};

export const validatePydanticAiResult = (
  value: JsonValue | undefined,
  runId: string,
): AgentResult => {
  const record = payloadRecord(value, "result");
  const identity = payloadRecord(record.identity, "result");
  if (
    !hasExactKeys(record, ["identity", "output", "status"]) ||
    !hasExactKeys(identity, ["runId"]) ||
    identity.runId !== runId ||
    record.status !== "completed"
  ) {
    throw new PydanticAiCompatibilityError(
      "malformed-result",
      "PydanticAI returned an invalid terminal result.",
    );
  }
  const output = registerAgentOutput(record.output);
  if (output.kind !== "text") {
    throw new PydanticAiCompatibilityError(
      "unsupported-portable-result",
      "The bounded PydanticAI operation supports only the kernel text-result contract.",
    );
  }
  return Object.freeze({
    identity: clonePortable(identity) as unknown as AgentResult["identity"],
    status: "completed",
    output,
  });
};

export const validatePydanticAiNativeResult = (
  value: JsonValue | undefined,
  runId: string,
  portableText: string,
): PydanticAiNativeRunObservation => {
  const envelope = payloadRecord(value, "native-result");
  const identity = payloadRecord(envelope.identity, "native-result");
  if (
    !hasExactKeys(envelope, ["identity", "observation"]) ||
    !hasExactKeys(identity, ["runId"]) ||
    identity.runId !== runId ||
    envelope.observation === undefined ||
    !isPydanticAiNativeRunObservation(envelope.observation)
  ) {
    throw new PydanticAiCompatibilityError(
      "malformed-native-result",
      "PydanticAI returned a native result that is not correlated to its portable terminal run.",
    );
  }
  const observation = envelope.observation as unknown as PydanticAiNativeRunObservation;
  if (observation.native.output !== portableText) {
    throw new PydanticAiCompatibilityError(
      "native-portable-result-mismatch",
      "PydanticAI native output does not match the portable terminal text.",
    );
  }
  return clonePortable(observation);
};

export const registerPydanticAiSpec = (input: AgentDefinition): AgentDefinition => {
  const spec = clonePortable(input);
  const keys = Object.keys(spec);
  if (
    keys.length !== 4 ||
    !keys.every((key) => ["agentId", "version", "instructions", "effectRequirement"].includes(key))
  ) {
    throw new PydanticAiCompatibilityError(
      "agent-definition-unsupported",
      "The bounded PydanticAI bridge accepts only the closed literal agent definition.",
    );
  }
  if (spec.effectRequirement === "controlled") {
    throw new PydanticAiCompatibilityError(
      "controlled-effects-unsupported",
      "PydanticAI deferred calls do not satisfy llm-core controlled-effect semantics.",
    );
  }
  if (spec.skills?.length) {
    throw new PydanticAiCompatibilityError(
      "skills-unsupported",
      "The bounded PydanticAI bridge does not support llm-core skill references.",
    );
  }
  if (spec.metadata && Object.keys(spec.metadata).length > 0) {
    throw new PydanticAiCompatibilityError(
      "metadata-unsupported",
      "The bounded PydanticAI bridge does not support arbitrary agent metadata.",
    );
  }
  if (spec.instructions.includes("{{") || spec.instructions.includes("}}")) {
    throw new PydanticAiCompatibilityError(
      "templates-unsupported",
      "The bounded PydanticAI bridge accepts literal instructions only.",
    );
  }
  return spec;
};

export const pydanticAiPromptInput = (input: JsonValue): { readonly prompt: string } => {
  const record = payloadRecord(clonePortable(input), "start");
  const prompt = record.prompt;
  if (Object.keys(record).length !== 1 || typeof prompt !== "string" || prompt.length === 0) {
    throw new PydanticAiCompatibilityError(
      "input-shape-unsupported",
      "The bounded PydanticAI bridge accepts only { prompt: string } input.",
    );
  }
  return { prompt };
};

export const hasPydanticAiOperationMatrix = (
  operations: readonly RuntimeOperationDeclaration[],
): boolean => sameOperationMatrix(operations, PYDANTIC_AI_OPERATIONS);
