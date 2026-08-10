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

export type SpecificationDiagnosticSeverity = "info" | "warning" | "error";
export type SpecificationDiagnosticImpact = "advisory" | "blocking";

/** A review or operation diagnostic. Impact is not an integration support level. */
export interface SpecificationDiagnostic {
  readonly code: string;
  readonly severity: SpecificationDiagnosticSeverity;
  readonly impact: SpecificationDiagnosticImpact;
  readonly explanation: string;
  readonly source?: SpecificationSourceBinding;
  readonly nodeId?: SpecificationNodeId;
}

export type SpecificationOperationId =
  | "observe-native-source"
  | "derive-portable-specification"
  | "compile-portable-specification"
  | "export-native-source"
  | "round-trip-native-source";

export type SpecificationOperationDisposition = "supported" | "unsupported" | "not-applicable";

/** The recognised source contract against which one operation is qualified. */
export interface SpecificationSourceContract {
  readonly authority: string;
  readonly format: SpecificationFormat;
  /** Immutable upstream revision, package version, or specification edition. */
  readonly revision: string;
}

interface SpecificationOperationBase {
  readonly operation: SpecificationOperationId;
  readonly sourceContract: SpecificationSourceContract;
  readonly diagnostics: readonly SpecificationDiagnostic[];
}

export type SpecificationOperation =
  | (SpecificationOperationBase & {
      readonly disposition: "supported";
      readonly fixtures: readonly SpecificationAdapterFixture[];
    })
  | (SpecificationOperationBase & {
      readonly disposition: "unsupported";
      readonly reason: string;
    })
  | (SpecificationOperationBase & {
      readonly disposition: "not-applicable";
      readonly reason: string;
      /** Evidence proving the source contract does not define the operation. */
      readonly evidence: readonly SpecificationEvidenceBinding[];
    });

type SpecificationOperationFor<TId extends SpecificationOperationId> = SpecificationOperation & {
  readonly operation: TId;
};

/** Closed operation matrix. Tuple order is the public operation-family order. */
export type SpecificationOperationMatrix = readonly [
  SpecificationOperationFor<"observe-native-source">,
  SpecificationOperationFor<"derive-portable-specification">,
  SpecificationOperationFor<"compile-portable-specification">,
  SpecificationOperationFor<"export-native-source">,
  SpecificationOperationFor<"round-trip-native-source">,
];

/** Internal canonical graph. It deliberately permits semantic cycles. */
export interface SpecificationGraph {
  readonly graphId: SpecificationGraphId;
  readonly version: ContractVersion;
  readonly sources: readonly SpecificationSourceSnapshot[];
  readonly nodes: readonly SpecificationNode[];
  readonly relationships: readonly SpecificationRelationship[];
}

/** Who retains authority over the source after the adapter has observed it. */
export type SpecificationAdapterSourceOwnership = "source-owned" | "adapter-owned";

/** A content-addressed fixture that substantiates one adapter support claim. */
export interface SpecificationAdapterFixture {
  readonly fixtureId: string;
  readonly digest: Digest;
}

/** Versioned, format-specific declaration without an adapter implementation. */
export interface SpecificationAdapterSupport {
  readonly format: SpecificationFormat;
  readonly authority: string;
  readonly revision: string;
  readonly sourceOwnership: SpecificationAdapterSourceOwnership;
  readonly operations: SpecificationOperationMatrix;
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
  | { readonly status: "rejected"; readonly issues: readonly SpecificationDiagnostic[] }
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
  readonly operation: SpecificationOperation;
}
