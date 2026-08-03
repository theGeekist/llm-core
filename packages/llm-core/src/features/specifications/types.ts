import type {
  ContractVersion,
  Digest,
  ExtensionNamespace,
  JsonValue,
  NativeExtensions,
} from "#contracts";
import type { SpecificationSemanticNode, SpecificationSemanticNodeKind } from "./semantic-types";

declare const specificationSourceIdBrand: unique symbol;
declare const specificationNodeIdBrand: unique symbol;
declare const specificationRelationshipIdBrand: unique symbol;
declare const specificationGraphIdBrand: unique symbol;
declare const specificationDecisionRecordIdBrand: unique symbol;
declare const proposedSpecificationChangeIdBrand: unique symbol;

export type SpecificationSourceId = string & {
  readonly [specificationSourceIdBrand]: "SpecificationSourceId";
};

export type SpecificationNodeId = string & {
  readonly [specificationNodeIdBrand]: "SpecificationNodeId";
};

export type SpecificationRelationshipId = string & {
  readonly [specificationRelationshipIdBrand]: "SpecificationRelationshipId";
};

export type SpecificationGraphId = string & {
  readonly [specificationGraphIdBrand]: "SpecificationGraphId";
};

export type SpecificationDecisionRecordId = string & {
  readonly [specificationDecisionRecordIdBrand]: "SpecificationDecisionRecordId";
};

export type ProposedSpecificationChangeId = string & {
  readonly [proposedSpecificationChangeIdBrand]: "ProposedSpecificationChangeId";
};

export interface SpecificationFormat {
  readonly id: ExtensionNamespace;
  readonly version: ContractVersion;
}

export type SpecificationSourceRole = "primary" | "overlay" | "reference" | "generated";
export type SpecificationSourceAuthority = "authoritative" | "advisory" | "informative";

export interface SpecificationSourceDocument {
  readonly documentId: string;
  readonly content: JsonValue;
}

/** A detached observation of one source-owned specification revision. */
export interface SpecificationSourceSnapshot {
  readonly sourceId: SpecificationSourceId;
  readonly format: SpecificationFormat;
  readonly revision: string;
  readonly contentDigest: Digest;
  readonly observedAt: string;
  readonly role: SpecificationSourceRole;
  readonly authority: SpecificationSourceAuthority;
  readonly documents: readonly SpecificationSourceDocument[];
  readonly extensions?: NativeExtensions;
}

export interface SpecificationSourceBinding {
  readonly sourceId: SpecificationSourceId;
  readonly documentId: string;
  readonly location?: string;
}

export type SpecificationDocumentNodeKind =
  | "requirement"
  | "decision"
  | "question"
  | "plan"
  | "workflow"
  | "artifact"
  | "other";

export type SpecificationNodeKind = SpecificationDocumentNodeKind | SpecificationSemanticNodeKind;

export interface SpecificationNodeShared {
  readonly nodeId: SpecificationNodeId;
  readonly title: string;
  readonly source: SpecificationSourceBinding;
  readonly extensions?: NativeExtensions;
}

export type SpecificationDocumentNode = SpecificationNodeShared & {
  readonly kind: SpecificationDocumentNodeKind;
  readonly content?: JsonValue;
};

/** Typed portable intent; integrations project these nodes into their own runtimes. */
export type SpecificationNode = SpecificationDocumentNode | SpecificationSemanticNode;

export type * from "./semantic-types";

export type SpecificationRelationshipKind =
  | "depends-on"
  | "relates"
  | "refines"
  | "conflicts"
  | "supersedes"
  | "implements"
  | "blocks";

export interface SpecificationRelationship {
  readonly relationshipId: SpecificationRelationshipId;
  readonly kind: SpecificationRelationshipKind;
  readonly from: SpecificationNodeId;
  readonly to: SpecificationNodeId;
  readonly source: SpecificationSourceBinding;
  readonly extensions?: NativeExtensions;
}

export type ConversionFidelity = "exact" | "partial" | "rejected";
export type ConversionIssueSeverity = "info" | "warning" | "error";
export type ConversionIssueDisposition = "preserved" | "degraded" | "rejected";

export interface ConversionIssue {
  readonly code: string;
  readonly severity: ConversionIssueSeverity;
  readonly disposition: ConversionIssueDisposition;
  readonly explanation: string;
  readonly source?: SpecificationSourceBinding;
  readonly nodeId?: SpecificationNodeId;
}

export interface ConversionReport {
  readonly fidelity: ConversionFidelity;
  readonly issues: readonly ConversionIssue[];
}

/** Internal canonical graph. It deliberately permits semantic cycles. */
export interface SpecificationGraph {
  readonly graphId: SpecificationGraphId;
  readonly version: ContractVersion;
  readonly sources: readonly SpecificationSourceSnapshot[];
  readonly nodes: readonly SpecificationNode[];
  readonly relationships: readonly SpecificationRelationship[];
  readonly report?: ConversionReport;
}

export type SpecificationAdapterDirection = "import" | "export" | "both";
/** Who retains authority over the source after the adapter has observed it. */
export type SpecificationAdapterSourceOwnership = "source-owned" | "adapter-owned";
/** Explicitly states whether the adapter can write a change back to its source. */
export type SpecificationAdapterWriteBack = "unsupported" | "proposal-only" | "source-authorized";
export type SpecificationConformanceLevel =
  | "syntax"
  | "semantic"
  | "compilation"
  | "round-trip"
  | "lifecycle";

/** A content-addressed fixture that substantiates one adapter support claim. */
export interface SpecificationAdapterFixture {
  readonly fixtureId: string;
  readonly digest: Digest;
}

/** Versioned, format-specific declaration without an adapter implementation. */
export interface SpecificationAdapterSupport {
  readonly format: SpecificationFormat;
  readonly direction: SpecificationAdapterDirection;
  readonly supportedVersions: readonly ContractVersion[];
  readonly levels: readonly SpecificationConformanceLevel[];
  readonly features: readonly string[];
  readonly preservedExtensionNamespaces: readonly ExtensionNamespace[];
  readonly sourceOwnership: SpecificationAdapterSourceOwnership;
  readonly writeBack: SpecificationAdapterWriteBack;
  readonly fixtures: readonly SpecificationAdapterFixture[];
  readonly evidence: readonly SpecificationEvidenceBinding[];
}

export interface SpecificationQuestion {
  readonly questionId: string;
  readonly prompt: string;
  readonly source: SpecificationSourceBinding;
}

export interface SpecificationEvidenceBinding {
  readonly evidenceId: string;
  readonly digest: Digest;
}

export interface SpecificationPolicyVersion {
  readonly policyId: string;
  readonly version: ContractVersion;
}

export interface SpecificationSourceRevisionBinding {
  readonly sourceId: SpecificationSourceId;
  readonly revision: string;
  readonly contentDigest: Digest;
}

export interface SpecificationDecisionSummary {
  readonly kind: "policy" | "human" | "combined";
  readonly summary: string;
}

export interface SpecificationDecisionValidity {
  readonly expiresAt?: string;
  readonly invalidatedBy: readonly ("source-revision" | "policy-version" | "scope-change")[];
}

/** Portable proof of an accepted decision. It is not execution authority. */
export interface SpecificationDecisionRecord {
  readonly recordId: SpecificationDecisionRecordId;
  readonly resolvedDigest: Digest;
  readonly acceptedScope: readonly SpecificationNodeId[];
  readonly decision: SpecificationDecisionSummary;
  readonly evidence: readonly SpecificationEvidenceBinding[];
  readonly authority: string;
  readonly policyVersions: readonly SpecificationPolicyVersion[];
  readonly sources: readonly SpecificationSourceRevisionBinding[];
  readonly validity: SpecificationDecisionValidity;
}

export type SpecificationDecision =
  | { readonly status: "accepted"; readonly record: SpecificationDecisionRecord }
  | { readonly status: "rejected"; readonly issues: readonly ConversionIssue[] }
  | { readonly status: "needs-input"; readonly questions: readonly SpecificationQuestion[] };

export interface ProposedSpecificationChangeTarget {
  readonly sourceId: SpecificationSourceId;
  readonly format: SpecificationFormat;
  readonly baseRevision: string;
  readonly baseDigest: Digest;
}

/** Portable, pure change data. Source application belongs to a later adapter lifecycle. */
export interface ProposedSpecificationChange {
  readonly changeId: ProposedSpecificationChangeId;
  readonly target: ProposedSpecificationChangeTarget;
  readonly changes: JsonValue;
  readonly originatingDecision: {
    readonly recordId: SpecificationDecisionRecordId;
    readonly resolvedDigest: Digest;
  };
  readonly evidence: readonly SpecificationEvidenceBinding[];
  readonly conversion: ConversionReport;
}
