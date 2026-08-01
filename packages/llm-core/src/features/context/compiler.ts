import { isExternalId, type TenantId } from "#contracts";
import {
  assertEvidenceRef,
  canonicalJson,
  hasExactKeys,
  isDenseArray,
  isNonNegativeInteger,
  isPlainRecord,
} from "./canonical";
import { createContextEntry, selectContext } from "./manifest";
import type {
  ContextCandidateEligibility,
  ContextClassification,
  ContextCompilation,
  ContextCompiler,
  ContextCompilerInput,
  ContextEntry,
  ContextEntryInput,
  ContextExclusionReason,
  ContextSelectionEvidence,
} from "./types";

const PURPOSE = /^[a-z][a-z0-9._-]{0,127}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const classificationRank: Record<ContextClassification, number> = {
  public: 0,
  internal: 1,
  restricted: 2,
};

const priorityRank = {
  required: 0,
  preferred: 1,
  optional: 2,
} as const;

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

const exactInstant = (value: unknown): value is string => {
  if (typeof value !== "string" || !INSTANT.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
};

const entryInput = (entry: ContextEntry): ContextEntryInput => ({
  source: entry.source,
  provenance: entry.provenance,
  priority: entry.priority,
  ...(entry.cost.tokens === undefined ? {} : { tokens: entry.cost.tokens }),
});

const assertEligibility = (value: unknown, original: ContextEntry): ContextCandidateEligibility => {
  if (!isPlainRecord(value)) {
    throw new TypeError("Context candidate eligibility must be closed, explicit, and portable.");
  }
  if (
    !hasExactKeys(
      value,
      [
        "sourceAuthorization",
        "tenantIds",
        "purposes",
        "classification",
        "freshUntil",
        "promptInjectionTreatment",
        "precedence",
        "evidence",
      ],
      ["redacted"],
    )
  ) {
    throw new TypeError("Context candidate eligibility must be closed, explicit, and portable.");
  }
  const tenantIds = value.tenantIds;
  const purposes = value.purposes;
  const evidenceValues = value.evidence;
  if (
    !["authorized", "denied"].includes(String(value.sourceAuthorization)) ||
    !Array.isArray(tenantIds) ||
    !isDenseArray(tenantIds) ||
    !tenantIds.every(isExternalId) ||
    new Set(tenantIds).size !== tenantIds.length ||
    !Array.isArray(purposes) ||
    !isDenseArray(purposes) ||
    purposes.length === 0 ||
    !purposes.every((purpose) => typeof purpose === "string" && PURPOSE.test(purpose)) ||
    new Set(purposes).size !== purposes.length ||
    !["public", "internal", "restricted"].includes(String(value.classification)) ||
    !exactInstant(value.freshUntil) ||
    !["allow", "redact", "deny"].includes(String(value.promptInjectionTreatment)) ||
    !isNonNegativeInteger(value.precedence) ||
    !Array.isArray(evidenceValues) ||
    !isDenseArray(evidenceValues) ||
    evidenceValues.length === 0
  ) {
    throw new TypeError("Context candidate eligibility must be closed, explicit, and portable.");
  }
  const evidence = evidenceValues.map((item) =>
    structuredClone(assertEvidenceRef(item, "Context eligibility evidence")),
  );
  if (new Set(evidence.map((item) => item.evidenceId)).size !== evidence.length) {
    throw new TypeError(
      "Context candidate eligibility evidence cannot contain duplicate identities.",
    );
  }

  if (value.promptInjectionTreatment !== "redact" && value.redacted !== undefined) {
    throw new TypeError("Only a redaction treatment may provide a replacement context entry.");
  }
  let redacted: ContextEntryInput | undefined;
  if (value.promptInjectionTreatment === "redact") {
    if (value.redacted === undefined) {
      throw new TypeError("Context redaction treatment requires a portable replacement entry.");
    }
    const replacement = createContextEntry(value.redacted as ContextEntryInput);
    if (
      replacement.priority !== original.priority ||
      canonicalJson(replacement.provenance) !== canonicalJson(original.provenance)
    ) {
      throw new TypeError("Context redaction must preserve the original priority and provenance.");
    }
    redacted = entryInput(replacement);
  }

  return deepFreeze({
    sourceAuthorization:
      value.sourceAuthorization as ContextCandidateEligibility["sourceAuthorization"],
    tenantIds: [...(value.tenantIds as TenantId[])],
    purposes: [...(value.purposes as string[])],
    classification: value.classification as ContextClassification,
    freshUntil: value.freshUntil,
    promptInjectionTreatment:
      value.promptInjectionTreatment as ContextCandidateEligibility["promptInjectionTreatment"],
    precedence: value.precedence,
    evidence,
    ...(redacted === undefined ? {} : { redacted }),
  });
};

interface Candidate {
  readonly index: number;
  readonly entry: ContextEntry;
  readonly input: ContextEntryInput;
  readonly eligibility: ContextCandidateEligibility;
}

const normalizedCandidates = (value: unknown): readonly Candidate[] => {
  if (!Array.isArray(value) || !isDenseArray(value)) {
    throw new TypeError("Context compiler candidates must be a dense array.");
  }
  return value.map((candidate, index) => {
    if (!isPlainRecord(candidate) || !hasExactKeys(candidate, ["entry", "eligibility"])) {
      throw new TypeError(
        "Context compiler candidates must be closed entry and eligibility records.",
      );
    }
    const entry = createContextEntry(candidate.entry as ContextEntryInput);
    return {
      index,
      entry,
      input: entryInput(entry),
      eligibility: assertEligibility(candidate.eligibility, entry),
    };
  });
};

interface NormalizedInput {
  readonly scope: ContextCompilerInput["scope"];
  readonly tenantId: TenantId | undefined;
  readonly purpose: string;
  readonly asOf: string;
  readonly maxClassification: ContextClassification;
  readonly budget: ContextCompilerInput["budget"];
  readonly candidates: readonly Candidate[];
}

const normalizeInput = (input: ContextCompilerInput): NormalizedInput => {
  if (
    !isPlainRecord(input) ||
    !hasExactKeys(
      input,
      ["scope", "purpose", "asOf", "maxClassification", "budget", "candidates"],
      ["tenantId"],
    ) ||
    typeof input.purpose !== "string" ||
    !PURPOSE.test(input.purpose) ||
    !exactInstant(input.asOf) ||
    !["public", "internal", "restricted"].includes(String(input.maxClassification)) ||
    (input.tenantId !== undefined && !isExternalId(input.tenantId))
  ) {
    throw new TypeError("Context compiler input must be closed, scoped, and explicitly timed.");
  }
  const empty = selectContext({ scope: input.scope, budget: input.budget, entries: [] });
  return {
    scope: empty.scope,
    tenantId: input.tenantId as TenantId | undefined,
    purpose: input.purpose,
    asOf: input.asOf,
    maxClassification: input.maxClassification as ContextClassification,
    budget: empty.budget,
    candidates: normalizedCandidates(input.candidates),
  };
};

const eligibilityReasons = (
  input: NormalizedInput,
  candidate: Candidate,
): ContextExclusionReason[] => {
  const { eligibility } = candidate;
  const reasons: ContextExclusionReason[] = [];
  if (eligibility.sourceAuthorization === "denied") reasons.push("source-authorization");
  if (
    eligibility.tenantIds.length > 0 &&
    (input.tenantId === undefined || !eligibility.tenantIds.includes(input.tenantId))
  ) {
    reasons.push("tenant");
  }
  if (!eligibility.purposes.includes(input.purpose)) reasons.push("purpose");
  if (
    classificationRank[eligibility.classification] > classificationRank[input.maxClassification]
  ) {
    reasons.push("classification");
  }
  if (input.asOf >= eligibility.freshUntil) reasons.push("freshness");
  if (eligibility.promptInjectionTreatment === "deny") reasons.push("prompt-injection-risk");
  return reasons;
};

const fitsBudget = (
  selected: readonly ContextEntryInput[],
  candidate: ContextEntryInput,
  budget: ContextCompilerInput["budget"],
): ContextExclusionReason | null => {
  const current = selected.map(createContextEntry);
  const candidateEntry = createContextEntry(candidate);
  if (budget.maxTokens !== undefined && candidateEntry.cost.tokens === undefined) {
    return "missing-token-cost";
  }
  const entries = current.length + 1;
  const bytes =
    current.reduce((total, entry) => total + entry.cost.bytes, 0) + candidateEntry.cost.bytes;
  const tokens =
    current.reduce((total, entry) => total + (entry.cost.tokens ?? 0), 0) +
    (candidateEntry.cost.tokens ?? 0);
  if (
    !Number.isSafeInteger(bytes) ||
    !Number.isSafeInteger(tokens) ||
    entries > budget.maxEntries ||
    bytes > budget.maxBytes ||
    (budget.maxTokens !== undefined && tokens > budget.maxTokens)
  ) {
    return "budget";
  }
  return null;
};

const compile = (input: ContextCompilerInput): ContextCompilation => {
  const normalized = normalizeInput(input);
  const ordered = [...normalized.candidates].sort((left, right) => {
    const priority = priorityRank[left.entry.priority] - priorityRank[right.entry.priority];
    if (priority !== 0) return priority;
    const precedence = left.eligibility.precedence - right.eligibility.precedence;
    return precedence !== 0 ? precedence : left.index - right.index;
  });
  const selected: ContextEntryInput[] = [];
  const selectedIdentities = new Set<string>();
  const evidenceByIndex = new Map<number, ContextSelectionEvidence>();

  for (const candidate of ordered) {
    const reasons = eligibilityReasons(normalized, candidate);
    if (reasons.length > 0) {
      evidenceByIndex.set(candidate.index, {
        entry: candidate.entry.identity,
        disposition: "excluded",
        reasons,
        eligibility: candidate.eligibility,
      });
      continue;
    }
    const redacted = candidate.eligibility.promptInjectionTreatment === "redact";
    const selectedInput = candidate.eligibility.redacted ?? candidate.input;
    const selectedEntry = createContextEntry(selectedInput);
    if (selectedIdentities.has(selectedEntry.identity.value)) {
      evidenceByIndex.set(candidate.index, {
        entry: candidate.entry.identity,
        disposition: "excluded",
        reasons: ["duplicate"],
        eligibility: candidate.eligibility,
      });
      continue;
    }
    const budgetReason = fitsBudget(selected, selectedInput, normalized.budget);
    if (budgetReason !== null) {
      evidenceByIndex.set(candidate.index, {
        entry: candidate.entry.identity,
        disposition: "excluded",
        reasons: [budgetReason],
        eligibility: candidate.eligibility,
      });
      continue;
    }
    selected.push(selectedInput);
    selectedIdentities.add(selectedEntry.identity.value);
    evidenceByIndex.set(candidate.index, {
      entry: candidate.entry.identity,
      disposition: redacted ? "redacted" : "included",
      reasons: redacted ? ["redaction"] : [],
      eligibility: candidate.eligibility,
      selectedEntry: selectedEntry.identity,
    });
  }

  const evidence = normalized.candidates.map((candidate) => evidenceByIndex.get(candidate.index)!);
  return deepFreeze({
    selection: selectContext({
      scope: normalized.scope,
      budget: normalized.budget,
      entries: selected,
    }),
    evidence,
  });
};

/** Creates the provider-neutral compiler; policy decisions are supplied as candidate facts. */
export const createContextCompiler = (): ContextCompiler => Object.freeze({ compile });
