import { isCanonicalUuid, type Digest } from "#contracts";
import {
  assertEvidenceRef,
  assertResourceRef,
  canonicalDigest,
  hasExactKeys,
  isClosedDigest,
  isDenseArray,
  isNonNegativeInteger,
  isPlainRecord,
  isPositiveInteger,
  ownDataValue,
  portableContentBytes,
} from "./canonical";
import type {
  ContextBudget,
  ContextBudgetUsage,
  ContextEntry,
  ContextEntryInput,
  ContextEntrySource,
  ContextManifest,
  ContextManifestInput,
  ContextProvenance,
  ContextScope,
} from "./types";

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

function assertScope(value: unknown): asserts value is ContextScope {
  if (!isPlainRecord(value)) {
    throw new TypeError("Context scope must be a closed invocation, run, or step scope.");
  }
  const kind = ownDataValue(value, "kind");
  if (typeof kind !== "string") {
    throw new TypeError("Context scope must be a closed invocation, run, or step scope.");
  }
  const valid =
    (kind === "invocation" &&
      hasExactKeys(value, ["kind", "invocationId"]) &&
      isCanonicalUuid(value.invocationId)) ||
    (kind === "run" &&
      hasExactKeys(value, ["kind", "invocationId", "runId"]) &&
      isCanonicalUuid(value.invocationId) &&
      isCanonicalUuid(value.runId)) ||
    (kind === "step" &&
      hasExactKeys(value, ["kind", "invocationId", "runId", "stepId"]) &&
      isCanonicalUuid(value.invocationId) &&
      isCanonicalUuid(value.runId) &&
      isCanonicalUuid(value.stepId));
  if (!valid) throw new TypeError("Context scope must carry exactly its canonical core IDs.");
}

function assertProvenance(value: unknown): asserts value is ContextProvenance {
  if (!isPlainRecord(value)) {
    throw new TypeError("Context provenance must be a closed portable record.");
  }
  const kind = ownDataValue(value, "kind");
  if (typeof kind !== "string") {
    throw new TypeError("Context provenance must be a closed portable record.");
  }
  if (
    kind === "supplied" &&
    hasExactKeys(value, ["kind", "source"]) &&
    ["application", "system", "user"].includes(String(value.source))
  ) {
    return;
  }
  if (
    kind === "derived" &&
    hasExactKeys(value, ["kind", "operation", "sources"]) &&
    typeof value.operation === "string" &&
    value.operation.length > 0 &&
    Array.isArray(value.sources) &&
    isDenseArray(value.sources) &&
    value.sources.length > 0 &&
    value.sources.every(isClosedDigest) &&
    new Set(value.sources.map((source) => `${source.algorithm}:${source.value}`)).size ===
      value.sources.length
  ) {
    return;
  }
  if (kind === "retrieved" && hasExactKeys(value, ["kind", "source"], ["evidence"])) {
    assertResourceRef(value.source, "Retrieved provenance source");
    if (value.evidence !== undefined) {
      assertEvidenceRef(value.evidence, "Retrieved provenance evidence");
    }
    return;
  }
  throw new TypeError("Context provenance is malformed or contains unknown fields.");
}

function assertSource(value: unknown): asserts value is ContextEntrySource {
  if (!isPlainRecord(value)) {
    throw new TypeError("Context entry source must be a closed portable record.");
  }
  const kind = ownDataValue(value, "kind");
  if (typeof kind !== "string") {
    throw new TypeError("Context entry source must be a closed portable record.");
  }
  if (
    kind === "content" &&
    hasExactKeys(value, ["kind", "content"]) &&
    Array.isArray(value.content) &&
    value.content.length > 0
  ) {
    portableContentBytes(value.content);
    return;
  }
  if (kind === "resource" && hasExactKeys(value, ["kind", "resource"])) {
    assertResourceRef(value.resource, "Context resource source");
    return;
  }
  if (kind === "evidence" && hasExactKeys(value, ["kind", "evidence"])) {
    assertEvidenceRef(value.evidence, "Context evidence source");
    return;
  }
  throw new TypeError("Context entry source is malformed or contains unknown fields.");
}

const sourceBytes = (source: ContextEntrySource): number => {
  if (source.kind === "content") return portableContentBytes(source.content);
  if (source.kind === "resource") return source.resource.byteLength;
  return source.evidence.content.byteLength;
};

function assertEntryInput(value: unknown): asserts value is ContextEntryInput {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["source", "provenance", "priority"], ["tokens"]) ||
    !["optional", "preferred", "required"].includes(String(value.priority)) ||
    (value.tokens !== undefined && !isNonNegativeInteger(value.tokens))
  ) {
    throw new TypeError("Context entries require closed source, provenance, priority, and cost.");
  }
  assertSource(value.source);
  assertProvenance(value.provenance);
}

function assertBudget(value: unknown): asserts value is ContextBudget {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["maxEntries", "maxBytes"], ["maxTokens"]) ||
    !isPositiveInteger(value.maxEntries) ||
    !isNonNegativeInteger(value.maxBytes) ||
    (value.maxTokens !== undefined && !isNonNegativeInteger(value.maxTokens))
  ) {
    throw new TypeError("Context budget must use closed non-negative integer limits.");
  }
}

export const createContextEntry = (input: ContextEntryInput): ContextEntry => {
  assertEntryInput(input);
  const cost = {
    bytes: sourceBytes(input.source),
    ...(input.tokens === undefined ? {} : { tokens: input.tokens }),
  };
  const identity = canonicalDigest({
    source: input.source,
    provenance: input.provenance,
    priority: input.priority,
    cost,
  });
  return deepFreeze(structuredClone({ identity, ...input, cost }));
};

const budgetUsage = (entries: readonly ContextEntry[]): ContextBudgetUsage => {
  const tokenCosts = entries.map((entry) => entry.cost.tokens);
  return {
    entries: entries.length,
    bytes: entries.reduce((total, entry) => total + entry.cost.bytes, 0),
    ...(tokenCosts.every((tokens) => tokens !== undefined)
      ? { tokens: tokenCosts.reduce((total, tokens) => total + (tokens ?? 0), 0) }
      : {}),
  };
};

const assertWithinBudget = (usage: ContextBudgetUsage, budget: ContextBudget): void => {
  if (usage.entries > budget.maxEntries || usage.bytes > budget.maxBytes) {
    throw new RangeError("Context manifest exceeds its entry or byte budget.");
  }
  if (budget.maxTokens !== undefined && usage.tokens === undefined) {
    throw new TypeError("A token budget requires an explicit token cost for every context entry.");
  }
  if (
    budget.maxTokens !== undefined &&
    usage.tokens !== undefined &&
    usage.tokens > budget.maxTokens
  ) {
    throw new RangeError("Context manifest exceeds its token budget.");
  }
};

export const createContextManifest = (input: ContextManifestInput): ContextManifest => {
  if (
    !isPlainRecord(input) ||
    !hasExactKeys(input, ["scope", "budget", "entries"]) ||
    !Array.isArray(input.entries) ||
    !isDenseArray(input.entries)
  ) {
    throw new TypeError("Context manifest input must be a closed portable record.");
  }
  assertScope(input.scope);
  assertBudget(input.budget);
  const entries = input.entries.map(createContextEntry);
  const identities = new Set(entries.map((entry) => entry.identity.value));
  if (identities.size !== entries.length) {
    throw new TypeError("Context manifests cannot contain duplicate entry identities.");
  }
  const usage = budgetUsage(entries);
  assertWithinBudget(usage, input.budget);
  const identity: Digest = canonicalDigest({
    scope: input.scope,
    budget: input.budget,
    usage,
    entries,
  });
  return deepFreeze(
    structuredClone({ identity, scope: input.scope, budget: input.budget, usage, entries }),
  );
};
