import { isJsonValue, type JsonValue } from "#contracts";

export interface AgentTextOutput {
  readonly kind: "text";
  readonly text: string;
}

export interface AgentJsonOutput {
  readonly kind: "json";
  readonly value: JsonValue;
}

export type AgentOutput = AgentTextOutput | AgentJsonOutput;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every((key) => expected.includes(key));
};

export const isAgentOutput = (value: unknown): value is AgentOutput => {
  if (!isJsonValue(value) || !isRecord(value)) {
    return false;
  }
  if (value.kind === "text") {
    return hasExactKeys(value, ["kind", "text"]) && typeof value.text === "string";
  }
  return (
    value.kind === "json" && hasExactKeys(value, ["kind", "value"]) && isJsonValue(value.value)
  );
};

const freezeJson = (value: JsonValue): JsonValue => {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freezeJson);
    Object.freeze(value);
  }
  return value;
};

export const registerAgentOutput = (value: unknown): AgentOutput => {
  if (!isAgentOutput(value)) {
    throw new TypeError("Agent output must use the closed portable text or JSON contract.");
  }
  const snapshot = structuredClone(value) as AgentOutput;
  if (snapshot.kind === "json") {
    freezeJson(snapshot.value);
  }
  return Object.freeze(snapshot);
};

export const createAgentTextOutput = (text: string): AgentTextOutput =>
  registerAgentOutput({ kind: "text", text }) as AgentTextOutput;

export const createAgentJsonOutput = (value: JsonValue): AgentJsonOutput =>
  registerAgentOutput({ kind: "json", value }) as AgentJsonOutput;
