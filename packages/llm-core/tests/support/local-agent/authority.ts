/** Test-only TypeScript runner support. */
import { maybeMap, type MaybePromise } from "#shared/maybe";
import type { AgentDefinition } from "../../../src/features/agent/public";
import { verifyCompilationAuthority } from "../../../src/application/specification-compiler/runtime";
import type { LocalAgentSpecificationAuthority } from "./types";

const canonicalPortable = (value: unknown): string | null => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? JSON.stringify(value) : null;
  }
  if (Array.isArray(value)) {
    const entries = value.map(canonicalPortable);
    return entries.every((entry): entry is string => entry !== null)
      ? `[${entries.join(",")}]`
      : null;
  }
  if (typeof value !== "object") return null;
  const entries = Object.entries(value)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => {
      const canonical = canonicalPortable(child);
      return canonical === null ? null : `${JSON.stringify(key)}:${canonical}`;
    });
  return entries.every((entry): entry is string => entry !== null)
    ? `{${entries.join(",")}}`
    : null;
};

const specificationMatches = (
  specification: LocalAgentSpecificationAuthority | undefined,
  definition: AgentDefinition,
): boolean => {
  if (specification === undefined) return true;
  const target = specification.compiled.value;
  if (typeof target !== "object" || target === null || !("agent" in target)) {
    return false;
  }
  const planned = target.agent;
  if (typeof planned !== "object" || planned === null) return false;
  const expected = canonicalPortable(definition);
  return expected !== null && canonicalPortable(planned) === expected;
};

/** Rechecks current authority and the exact runner target before construction or execution. */
export const verifyLocalAgentSpecification = (
  specification: LocalAgentSpecificationAuthority | undefined,
  definition?: AgentDefinition,
): MaybePromise<void> =>
  specification === undefined
    ? undefined
    : maybeMap(
        () => {
          if (definition && !specificationMatches(specification, definition)) {
            throw new TypeError("Compiled specification does not authorize this Agent definition.");
          }
        },
        verifyCompilationAuthority({
          compiled: specification.compiled,
          authority: specification.authority,
        }),
      );
