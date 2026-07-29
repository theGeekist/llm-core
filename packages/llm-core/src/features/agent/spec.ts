import { isContractVersion, isExternalId, isJsonValue } from "#contracts";
import type { AgentSpec, PreparedAgentSpec } from "./types";

const preparedAgentSpecs = new WeakSet<object>();

const clone = <T>(value: T): T => structuredClone(value);

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
};

export const prepareAgentSpec = (spec: AgentSpec): PreparedAgentSpec => {
  if (
    !isExternalId(spec.agentId) ||
    !isContractVersion(spec.version) ||
    typeof spec.instructions !== "string" ||
    spec.instructions.length === 0 ||
    (spec.effectRequirement !== "read-only" && spec.effectRequirement !== "controlled") ||
    (spec.metadata !== undefined && !isJsonValue(spec.metadata))
  ) {
    throw new TypeError("AgentSpec must be portable and use explicit execution requirements.");
  }
  const prepared = deepFreeze(clone(spec)) as PreparedAgentSpec;
  preparedAgentSpecs.add(prepared);
  return prepared;
};

export const isPreparedAgentSpec = (value: unknown): value is PreparedAgentSpec =>
  typeof value === "object" && value !== null && preparedAgentSpecs.has(value);
