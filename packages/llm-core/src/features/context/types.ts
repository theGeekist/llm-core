import type {
  Digest,
  EvidenceRef,
  InvocationId,
  PortableContent,
  ResourceRef,
  RunId,
  StepId,
  TenantId,
} from "#contracts";

export type ContextEntryPriority = "optional" | "preferred" | "required";

export type ContextScope =
  | {
      kind: "invocation";
      invocationId: InvocationId;
    }
  | {
      kind: "run";
      invocationId: InvocationId;
      runId: RunId;
    }
  | {
      kind: "step";
      invocationId: InvocationId;
      runId: RunId;
      stepId: StepId;
    };

export type ContextProvenance =
  | {
      kind: "supplied";
      source: "application" | "system" | "user";
    }
  | {
      kind: "derived";
      operation: string;
      sources: Digest[];
    }
  | {
      kind: "retrieved";
      source: ResourceRef;
      evidence?: EvidenceRef;
    };

export type ContextEntrySource =
  | {
      kind: "content";
      content: PortableContent[];
    }
  | {
      kind: "resource";
      resource: ResourceRef;
    }
  | {
      kind: "evidence";
      evidence: EvidenceRef;
    };

export interface ContextEntryCost {
  bytes: number;
  tokens?: number;
}

export interface ContextEntry {
  identity: Digest;
  source: ContextEntrySource;
  provenance: ContextProvenance;
  priority: ContextEntryPriority;
  cost: ContextEntryCost;
}

export interface ContextBudget {
  maxEntries: number;
  maxBytes: number;
  maxTokens?: number;
}

export interface ContextBudgetUsage {
  entries: number;
  bytes: number;
  tokens?: number;
}

export interface ContextSelection {
  identity: Digest;
  scope: ContextScope;
  budget: ContextBudget;
  usage: ContextBudgetUsage;
  entries: ContextEntry[];
}

export interface ContextEntryInput {
  source: ContextEntrySource;
  provenance: ContextProvenance;
  priority: ContextEntryPriority;
  tokens?: number;
}

export interface ContextSelectionInput {
  scope: ContextScope;
  budget: ContextBudget;
  entries: ContextEntryInput[];
}

export type ContextClassification = "public" | "internal" | "restricted";

/**
 * An explicit, evidence-bearing eligibility observation. A smaller precedence
 * value is selected before a larger one within the same entry priority.
 */
export interface ContextCandidateEligibility {
  sourceAuthorization: "authorized" | "denied";
  /** Empty means the source is tenant-neutral; otherwise an exact match is required. */
  tenantIds: TenantId[];
  /** Exact, stable purpose names for which the source may be selected. */
  purposes: string[];
  classification: ContextClassification;
  /** Canonical RFC 3339 UTC instant after which this source is stale. */
  freshUntil: string;
  promptInjectionTreatment: "allow" | "redact" | "deny";
  precedence: number;
  evidence: EvidenceRef[];
  /**
   * A policy-produced portable replacement. It is required when classification
   * or prompt-injection treatment requires redaction.
   */
  redacted?: ContextEntryInput;
}

export interface ContextCandidate {
  entry: ContextEntryInput;
  eligibility: ContextCandidateEligibility;
}

export interface ContextCompilerInput {
  scope: ContextScope;
  tenantId?: TenantId;
  purpose: string;
  /** Canonical evaluation instant; the compiler never reads the ambient clock. */
  asOf: string;
  maxClassification: ContextClassification;
  budget: ContextBudget;
  candidates: ContextCandidate[];
}

export type ContextSelectionDisposition = "excluded" | "included" | "redacted";

export type ContextExclusionReason =
  | "budget"
  | "classification"
  | "duplicate"
  | "freshness"
  | "missing-token-cost"
  | "prompt-injection-risk"
  | "purpose"
  | "source-authorization"
  | "tenant"
  | "redaction";

/** Immutable rationale for every candidate considered by a compilation. */
export interface ContextSelectionEvidence {
  entry: Digest;
  disposition: ContextSelectionDisposition;
  reasons: ContextExclusionReason[];
  eligibility: ContextCandidateEligibility;
  selectedEntry?: Digest;
}

export interface ContextCompilation {
  selection: ContextSelection;
  evidence: ContextSelectionEvidence[];
}

/** Provider-neutral context eligibility and deterministic selection port. */
export interface ContextCompiler {
  compile(input: ContextCompilerInput): ContextCompilation;
}
