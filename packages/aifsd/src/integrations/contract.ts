import type { Digest, EvidenceRef, JsonValue, SecretRef } from "@aifsd/llm-core/contracts";
import type {
  ConfigurationResult,
  DependencyMember,
  ExecutableClosure,
  MaybePromise,
  TrustLevel,
} from "../config/index.js";

export type { Digest, EvidenceRef, JsonValue, SecretRef };
export type { ConfigurationResult, DependencyMember, ExecutableClosure, MaybePromise, TrustLevel };

export type IntegrationClass =
  | "development"
  | "runtime"
  | "specification"
  | "delivery"
  | "infrastructure"
  | "service-connector";

export type OperationDisposition = "supported" | "unsupported" | "not-applicable";

export interface UpstreamRelease {
  readonly name: string;
  readonly version: string;
  readonly source: string;
  readonly revision: string;
}

export interface OperationClaim {
  readonly operationId: string;
  readonly disposition: OperationDisposition;
  readonly upstream: string;
  readonly upstreamVersion: string;
}

export interface IntegrationPermissions {
  readonly filesystem: readonly string[];
  readonly process: readonly string[];
  readonly network: readonly string[];
  readonly effects: readonly string[];
  readonly secretSlots: readonly string[];
}

export interface IntegrationEntrypoints {
  readonly metadata: string;
  readonly qualification: string;
  readonly native?: string;
}

export interface IntegrationIdentity {
  readonly name: string;
  readonly version: string;
  readonly publisher: string;
  readonly license: string;
}

export interface IntegrationManifest {
  readonly schemaVersion: "1.0.0";
  readonly identity: IntegrationIdentity;
  readonly integrationClass: IntegrationClass;
  readonly capabilities: readonly string[];
  readonly upstreams: readonly UpstreamRelease[];
  readonly operations: readonly OperationClaim[];
  readonly entrypoints: IntegrationEntrypoints;
  readonly permissions: IntegrationPermissions;
  readonly settingsSchema?: Readonly<Record<string, JsonValue>>;
  readonly secretReferences?: Readonly<Record<string, SecretRef>>;
}

export type IntegrationDiagnosticCode =
  | "invalid-manifest"
  | "non-portable-value"
  | "unsupported-schema-version"
  | "claim-exceeds-evidence"
  | "subject-mismatch"
  | "artifact-mismatch"
  | "closure-mismatch"
  | "lifecycle-script-forbidden"
  | "qualification-boundary-invalid"
  | "qualification-request-invalid"
  | "qualification-executor-admission-invalid"
  | "qualification-executor-admission-denied"
  | "qualification-required"
  | "publication-admission-invalid"
  | "publication-admission-denied"
  | "activation-grant-invalid"
  | "activation-grant-stale"
  | "activation-receipt-invalid";

export interface IntegrationDiagnostic {
  readonly code: IntegrationDiagnosticCode;
  readonly reasonCode: string;
  readonly path?: string;
}

export type IntegrationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly IntegrationDiagnostic[] };

export interface AuthoringRequest {
  readonly identity: IntegrationIdentity;
  readonly integrationClass: IntegrationClass;
  readonly capabilities: readonly string[];
  readonly upstreams: readonly UpstreamRelease[];
  readonly operations: readonly OperationClaim[];
  readonly permissions: IntegrationPermissions;
}

export interface ProposedFile {
  readonly path: string;
  readonly ownership: "integration";
  readonly content: string;
  readonly contentDigest: Digest;
}

export interface AuthoringProposal {
  readonly status: "proposal";
  readonly manifest: IntegrationManifest;
  readonly files: readonly ProposedFile[];
  readonly proposalDigest: Digest;
}

export interface LocalIntegrationRelease {
  readonly source: "local";
  readonly manifest: IntegrationManifest;
  readonly manifestDigest: Digest;
  readonly rootArtifact: DependencyMember;
  readonly executableClosure: ExecutableClosure;
}

export interface IntegrationMetadataResolutionRequest {
  readonly releases: readonly unknown[];
  readonly name: string;
  readonly version: string;
}

export interface ResolvedIntegrationMetadata {
  readonly manifest: IntegrationManifest;
  readonly manifestDigest: Digest;
  readonly rootArtifact: DependencyMember;
  readonly executableClosure: ExecutableClosure;
  readonly trust: TrustLevel;
}

export interface AcquisitionObservation {
  readonly rootArtifact: DependencyMember;
  readonly executableClosure: ExecutableClosure;
  readonly lifecycleScriptsEnabled: boolean;
}

export interface AcquiredIntegration extends ResolvedIntegrationMetadata {
  readonly acquiredAt: string;
}

export type ObservationOutcome =
  | "observed-supported"
  | "observed-unsupported"
  | "observed-not-applicable";

export type ObservationBasis = "execution" | "pinned-source";

export interface NativeObservation {
  readonly operationId: string;
  readonly upstreamVersion: string;
  readonly outcome: ObservationOutcome;
  readonly basis: ObservationBasis;
  readonly evidence: EvidenceRef;
}

export interface QualificationBoundaryEvidence {
  readonly executorId: string;
  readonly workerId: string;
  readonly policyDigest: Digest;
  readonly rootArtifactDigest: Digest;
  readonly subjectClosureDigest: Digest;
  readonly suiteDigest: Digest;
  readonly isolatedWorker: true;
  readonly ambientCredentials: false;
  readonly lifecycleScriptsEnabled: false;
  readonly filesystem: readonly string[];
  readonly process: readonly string[];
  readonly network: readonly string[];
  readonly environmentKeys: readonly string[];
  readonly startedAt: string;
  readonly completedAt: string;
  readonly exitCode: 0;
  readonly evidence: EvidenceRef;
}

export interface QualificationExecution {
  readonly observations: readonly NativeObservation[];
  readonly boundary: QualificationBoundaryEvidence;
  readonly executionDigest: Digest;
}

export interface QualificationRequest {
  readonly acquisition: AcquiredIntegration;
  readonly suiteDigest: Digest;
  readonly qualifiedAt: string;
}

export interface QualificationExecutor {
  readonly executorId: string;
  readonly workerId: string;
  readonly execute: (request: QualificationRequest) => MaybePromise<unknown>;
}

export interface QualificationExecutorAdmission {
  readonly authorityId: string;
  readonly admissionId: string;
  readonly executorId: string;
  readonly workerId: string;
  readonly admittedAt: string;
  readonly expiresAt: string;
  readonly signature: string;
}

export interface QualificationExecutorAuthority {
  readonly authorityId: string;
  readonly verify: (admission: QualificationExecutorAdmission) => MaybePromise<boolean>;
}

export interface QualificationExecutorRegistration {
  readonly executor: QualificationExecutor;
  readonly admission: unknown;
}

export interface QualificationService {
  readonly authorityId: string;
}

export interface QualificationEvidence {
  readonly status: "qualified";
  readonly integrationName: string;
  readonly integrationVersion: string;
  readonly manifestDigest: Digest;
  readonly rootArtifactDigest: Digest;
  readonly subjectClosureDigest: Digest;
  readonly suiteDigest: Digest;
  readonly observations: readonly NativeObservation[];
  readonly boundary: QualificationBoundaryEvidence;
  readonly executionDigest: Digest;
  readonly executorId: string;
  readonly workerId: string;
  readonly executorAdmission: QualificationExecutorAdmission;
  readonly qualifiedAt: string;
  readonly evidenceDigest: Digest;
}

export interface PublicationAdmission {
  readonly authorityId: string;
  readonly decisionId: string;
  readonly integrationName: string;
  readonly integrationVersion: string;
  readonly manifestDigest: Digest;
  readonly qualificationEvidenceDigest: Digest;
  readonly catalogSubjectDigest: Digest;
  readonly trust: Exclude<TrustLevel, "local">;
  readonly decidedAt: string;
  readonly signature: string;
}

export interface PublicationAuthority {
  readonly authorityId: string;
  readonly verify: (admission: PublicationAdmission) => MaybePromise<boolean>;
}

export interface IntegrationTrustService {
  readonly qualificationAuthorityId: string;
  readonly publicationAuthorityId: string;
}

export interface CatalogMetadata {
  readonly manifest: IntegrationManifest;
  readonly manifestDigest: Digest;
  readonly rootArtifact: DependencyMember;
  readonly executableClosure: ExecutableClosure;
  readonly qualification: QualificationEvidence;
  readonly admission: PublicationAdmission;
  readonly trust: Exclude<TrustLevel, "local">;
  readonly metadataDigest: Digest;
}

export interface CatalogPublicationRequest {
  readonly manifest: unknown;
  readonly rootArtifact: unknown;
  readonly executableClosure: unknown;
  readonly qualification: unknown;
  readonly admission: unknown;
}

export interface ActivationGrant {
  readonly grantId: string;
  readonly workerId: string;
  readonly integrationName: string;
  readonly integrationVersion: string;
  readonly rootArtifactDigest: Digest;
  readonly subjectClosureDigest: Digest;
  readonly operation: string;
  readonly workspace: string;
  readonly filesystem: readonly string[];
  readonly process: readonly string[];
  readonly network: readonly string[];
  readonly effects: readonly string[];
  readonly credentialBindings: Readonly<Record<string, SecretRef>>;
  readonly expiresAt: string;
}

export interface ActivationRequest {
  readonly acquisition: AcquiredIntegration;
  readonly qualification: QualificationEvidence;
  readonly grant: ActivationGrant;
  readonly now: string;
}

export interface ActivationReceipt {
  readonly grantId: string;
  readonly operation: string;
  readonly workerId: string;
  readonly nativeResult: JsonValue;
}

export interface IntegrationWorker {
  readonly workerId: string;
  readonly activate: (request: ActivationRequest) => MaybePromise<ActivationReceipt>;
}
