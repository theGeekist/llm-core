import { isContractVersion, isExternalId, isJsonValue } from "#contracts";
import type { AgentSpec, PreparedAgentSpec } from "./types";
import { registerAgentSkill } from "./skills";

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

const SENSITIVE_METADATA_KEYS = new Set([
  "credential",
  "filepath",
  "localpath",
  "locator",
  "path",
  "signedurl",
  "url",
  "uri",
]);
const LOCATOR_VALUE = /^(?:[a-z][a-z\d+.-]*:\/\/|\/|~\/|\.{1,2}\/|[a-z]:[\\/]|\\\\|file:)/i;
const normalizedKey = (key: string): string => key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
const isSensitiveMetadataKey = (key: string): boolean => {
  const normalized = normalizedKey(key);
  return [...SENSITIVE_METADATA_KEYS].some((sensitive) => normalized.includes(sensitive));
};

const isSafeMetadata = (value: unknown): boolean => {
  if (typeof value === "string") {
    return !LOCATOR_VALUE.test(value);
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isSafeMetadata);
  }
  return (
    typeof value === "object" &&
    Object.entries(value).every(
      ([key, child]) => !isSensitiveMetadataKey(key) && isSafeMetadata(child),
    )
  );
};

/**
 * Internal constructor used only by AgentRunner.prepare implementations.
 * Public callers submit portable AgentSpec values to a runner.
 */
export const createPreparedAgentSpec = (spec: AgentSpec): PreparedAgentSpec => {
  if (
    Object.keys(spec).every((key) =>
      ["agentId", "version", "instructions", "effectRequirement", "metadata", "skills"].includes(
        key,
      ),
    ) === false ||
    !isExternalId(spec.agentId) ||
    !isContractVersion(spec.version) ||
    typeof spec.instructions !== "string" ||
    spec.instructions.length === 0 ||
    (spec.effectRequirement !== "read-only" && spec.effectRequirement !== "controlled") ||
    (spec.metadata !== undefined &&
      (!isJsonValue(spec.metadata) || !isSafeMetadata(spec.metadata))) ||
    (spec.skills !== undefined && !Array.isArray(spec.skills))
  ) {
    throw new TypeError("AgentSpec must be portable and use explicit execution requirements.");
  }
  const skills = spec.skills?.map(registerAgentSkill);
  if (
    skills !== undefined &&
    new Set(skills.map((skill) => `${skill.scope}:${skill.skillId}`)).size !== skills.length
  ) {
    throw new TypeError("AgentSpec skills must use unique scope and skill identities.");
  }
  const prepared = deepFreeze(
    clone({
      ...spec,
      ...(skills === undefined ? {} : { skills }),
    }),
  ) as PreparedAgentSpec;
  preparedAgentSpecs.add(prepared);
  return prepared;
};

export const isPreparedAgentSpec = (value: unknown): value is PreparedAgentSpec =>
  typeof value === "object" && value !== null && preparedAgentSpecs.has(value);
