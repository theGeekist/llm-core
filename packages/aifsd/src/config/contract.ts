// AIFSD configuration boundary contract.
//
// These are the portable, data-only types that cross the configuration front
// door. AIFSD owns the manifest, selection, resolution, lock and
// materialization vocabulary; identity primitives (digests, secret and
// resource references, evidence) are reused from the `@aifsd/llm-core`
// kernel rather than duplicated (ADR-003, ADR-007).

import type {
  ContractVersion,
  Digest,
  EvidenceRef,
  JsonValue,
  SecretRef,
} from "@aifsd/llm-core/contracts";
import type { MaybePromise } from "@wpkernel/pipeline/core/types";

export type { ContractVersion, Digest, EvidenceRef, JsonValue, MaybePromise, SecretRef };

// --- Result and diagnostics -------------------------------------------------

export type ConfigurationDiagnosticCode =
  | "unknown-field"
  | "unsupported-version"
  | "unverified-integrity"
  | "non-portable-value"
  | "raw-secret"
  | "live-object"
  | "undefined-value"
  | "unresolved-selection"
  | "ambiguous-selection"
  | "closure-incomplete"
  | "evidence-subject-mismatch"
  | "lock-invalidated"
  | "digest-mismatch"
  | "ownership-conflict"
  | "stale-plan";

/** Stable renderer-neutral cause within a broad diagnostic category. */
export type ConfigurationDiagnosticReasonCode =
  | "unexpected-field"
  | "expected-object"
  | "expected-plain-object"
  | "expected-string"
  | "expected-non-empty-string"
  | "expected-string-array"
  | "expected-array"
  | "expected-non-empty-array"
  | "expected-digest"
  | "expected-canonical-uuid"
  | "expected-media-type"
  | "expected-non-negative-integer"
  | "expected-non-negative-safe-integer"
  | "invalid-enum-value"
  | "invalid-schema-reference"
  | "invalid-portable-value"
  | "undefined-value"
  | "live-object"
  | "secret-reference-required"
  | "secret-reference-forbidden"
  | "credential-shaped-setting"
  | "duplicate-coordinate"
  | "trust-minimum-weakened"
  | "unsupported-schema-version"
  | "unsupported-version-range"
  | "no-trusted-release"
  | "no-matching-release"
  | "unknown-environment"
  | "ambiguous-release"
  | "resolver-coordinate-mismatch"
  | "resolved-version-out-of-range"
  | "closure-members-duplicated"
  | "closure-digest-mismatch"
  | "artifact-root-mismatch"
  | "trust-below-minimum"
  | "evidence-subject-mismatch"
  | "catalog-coordinate-not-unique"
  | "resolver-artifact-mismatch"
  | "resolver-closure-mismatch"
  | "resolver-trust-mismatch"
  | "resolver-signature-mismatch"
  | "resolver-evidence-mismatch"
  | "catalog-snapshot-mismatch"
  | "catalog-identity-not-approved"
  | "catalog-snapshot-not-approved"
  | "catalog-replay-policy-violated"
  | "closure-incomplete"
  | "approved-lock-malformed"
  | "approved-lock-mismatch"
  | "dependency-duplicated"
  | "catalog-authority-drift"
  | "schema-version-drift"
  | "manifest-digest-drift"
  | "catalog-identity-drift"
  | "catalog-sequence-drift"
  | "catalog-snapshot-drift"
  | "generator-drift"
  | "resolution-decision-mismatch"
  | "resolution-decisions-drift"
  | "materialization-inputs-drift"
  | "target-platform-drift"
  | "dependency-missing"
  | "dependency-identity-drift"
  | "evidence-binding-drift"
  | "dependency-added"
  | "non-canonical-path"
  | "invalid-reason-code"
  | "invalid-precondition"
  | "precondition-kind-mismatch"
  | "ownership-kind-mismatch"
  | "ownership-reason-mismatch"
  | "rename-destination-invalid"
  | "rename-destination-forbidden"
  | "content-required"
  | "content-forbidden"
  | "content-pair-invalid"
  | "content-digest-mismatch"
  | "source-path-duplicated"
  | "rename-destination-duplicated"
  | "rename-destination-collision"
  | "plan-preview-mismatch"
  | "approved-lock-not-portable"
  | "plan-lock-mismatch"
  | "plan-precondition-stale"
  | "change-status-invalid"
  | "plan-malformed";

export interface ConfigurationDiagnostic {
  readonly code: ConfigurationDiagnosticCode;
  readonly reasonCode: ConfigurationDiagnosticReasonCode;
  /** JSON-pointer-ish path into the offending input, when locatable. */
  readonly path?: string;
}

export type ConfigurationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly ConfigurationDiagnostic[] };

// --- Shared identities ------------------------------------------------------

/** Qualification level of one exact release and evidence set. */
export type TrustLevel = "local" | "community" | "verified" | "official";

export interface CatalogIdentity {
  readonly id: string;
  readonly version: string;
}

export interface GeneratorIdentity {
  readonly id: string;
  readonly version: string;
  readonly artifactDigest: Digest;
}

export interface TargetPlatform {
  readonly os: string;
  readonly arch: string;
}

export interface TrustRequirement {
  readonly minimum: TrustLevel;
}

/** Qualification evidence bound to the exact closure it qualifies. */
export interface EvidenceBinding {
  readonly evidence: EvidenceRef;
  readonly subjectClosureDigest: Digest;
}

// --- Layer 1 & 2: durable manifest (intent + selection) ---------------------

export interface ConfigurationIntent {
  /** Small, reviewable description a human keeps under version control. */
  readonly summary: string;
  /** Requested outcomes/capabilities in stable, portable words. */
  readonly outcomes: readonly string[];
}

export type SelectionKind = "template" | "integration";

export interface Selection {
  readonly kind: SelectionKind;
  /** Catalog name of the selected template or integration. */
  readonly name: string;
  /** Validated wire version range, e.g. `1.2.3`, `^1.2.0`, `*`. */
  readonly versionRange: string;
  /** Minimum trust required of the SELECTED release (not the catalog). */
  readonly trust?: TrustRequirement;
  /** Opaque credential references only; never credential values. */
  readonly secrets?: Readonly<Record<string, SecretRef>>;
  /** Portable, JSON-only selection settings. */
  readonly settings?: Readonly<Record<string, JsonValue>>;
}

export interface EnvironmentOverlay {
  /**
   * Overlays affect selection only; per-selection secrets/settings ride on the
   * selections themselves, so nothing is merged then silently dropped.
   */
  readonly selections?: readonly Selection[];
}

export interface Manifest {
  readonly schemaVersion: ContractVersion;
  readonly intent: ConfigurationIntent;
  readonly selections: readonly Selection[];
  /** Named environments (e.g. local, preview, production) as explicit overlays. */
  readonly environments?: Readonly<Record<string, EnvironmentOverlay>>;
}

// --- Executable dependency closure (ADR-003 closure identity) ---------------

export interface DependencyMember {
  /** Package coordinate/identifier. */
  readonly id: string;
  readonly version: string;
  readonly digest: Digest;
}

/**
 * A closure may be represented directly by its members, by a package-manager
 * lock digest, or by a deterministic bundle / Merkle-root digest.
 */
export type ClosureRepresentation =
  | { readonly kind: "members"; readonly members: readonly DependencyMember[] }
  | { readonly kind: "package-lock"; readonly lockDigest: Digest }
  | { readonly kind: "bundle"; readonly bundleDigest: Digest };

export interface ExecutableClosure {
  readonly root: DependencyMember;
  readonly representation: ClosureRepresentation;
}

// --- Catalog (resolution input) ---------------------------------------------

export interface CatalogEntry {
  readonly kind: SelectionKind;
  readonly name: string;
  /** Exact version this entry publishes. */
  readonly version: string;
  readonly artifactDigest: Digest;
  readonly closure: ExecutableClosure;
  /** Trust level of this specific release. */
  readonly trust: TrustLevel;
  /** Evidence must arrive already bound to the closure it qualifies. */
  readonly evidence?: readonly EvidenceBinding[];
  /** Opaque publisher signature, when present. */
  readonly signature?: string;
}

export interface CatalogAuthority {
  readonly provenance: string;
  /** Opaque signature verified before a snapshot is approved for resolution. */
  readonly signature: string;
}

export interface Catalog {
  readonly identity: CatalogIdentity;
  /** Monotonic publisher sequence used by the caller's replay policy. */
  readonly sequence: number;
  readonly snapshotDigest: Digest;
  readonly authority: CatalogAuthority;
  readonly entries: readonly CatalogEntry[];
}

/**
 * Trusted admission supplied by the host after signature and freshness checks.
 * Resolution accepts only the exact digest and rejects sequences below policy.
 */
export interface CatalogAdmission {
  readonly catalog: CatalogIdentity;
  readonly snapshotDigest: Digest;
  readonly minimumSequence: number;
}

// --- Layer 3: resolution ----------------------------------------------------

export interface ResolvedSelection {
  readonly kind: SelectionKind;
  readonly name: string;
  /** Exact version chosen deterministically from the catalog. */
  readonly version: string;
  readonly artifactDigest: Digest;
  readonly closure: ExecutableClosure;
  /** Complete executable-closure identity (root + full closure). */
  readonly closureDigest: Digest;
  /** Trust of the selected release. */
  readonly trust: TrustLevel;
  readonly signature?: string;
  /** Evidence verified against this selection's closure digest. */
  readonly evidence: readonly EvidenceBinding[];
}

export type ResolutionVersionReasonCode =
  | "highest-compatible-release"
  | "highest-compatible-trusted-release"
  | "compatible-release-selected";

/** Immutable facts captured when one manifest selection is resolved. */
export interface ResolutionDecision {
  readonly kind: "selection-resolution";
  readonly selectionKind: SelectionKind;
  readonly name: string;
  readonly selectionReasonCode: "manifest-selection";
  readonly versionReasonCode: ResolutionVersionReasonCode;
  readonly requestedVersionRange: string;
  readonly minimumTrust?: TrustLevel;
  readonly eligibleVersions: readonly string[];
  readonly selectedVersion: string;
  readonly selectedTrust: TrustLevel;
  readonly artifactDigest: Digest;
  readonly closureDigest: Digest;
}

export interface ResolvedConfiguration {
  readonly manifestVersion: ContractVersion;
  /** Canonical digest of the resolved manifest, bound at resolution time. */
  readonly manifestDigest: Digest;
  readonly catalog: CatalogIdentity;
  readonly catalogSequence: number;
  readonly catalogSnapshotDigest: Digest;
  readonly catalogAuthority: CatalogAuthority;
  readonly generator: GeneratorIdentity;
  readonly selections: readonly ResolvedSelection[];
  readonly resolutionDecisions: readonly ResolutionDecision[];
}

export interface SelectionResolutionQuery {
  readonly selection: Selection;
  readonly catalog: Catalog;
}

/** Metadata-only resolver. It must never load or execute integration code. */
export interface SelectionResolver {
  readonly resolve: (query: SelectionResolutionQuery) => MaybePromise<ResolvedSelection | null>;
}

export interface ResolutionDependencies {
  readonly resolver?: SelectionResolver;
  readonly generator: GeneratorIdentity;
  /** External signature/freshness approval for this exact catalogue snapshot. */
  readonly catalogAdmission: CatalogAdmission;
  /** Named environment overlay to apply deterministically, when set. */
  readonly environment?: string;
}

// --- Lock (reproducibility) -------------------------------------------------

export interface LockedDependency {
  readonly kind: SelectionKind;
  readonly name: string;
  readonly version: string;
  readonly artifactDigest: Digest;
  readonly closureDigest: Digest;
  readonly trust: TrustLevel;
  readonly signature?: string;
  readonly evidence: readonly EvidenceBinding[];
}

export interface ConfigurationLock {
  readonly schemaVersion: ContractVersion;
  readonly manifestDigest: Digest;
  readonly catalog: CatalogIdentity;
  readonly catalogSequence: number;
  readonly catalogSnapshotDigest: Digest;
  readonly catalogAuthority: CatalogAuthority;
  readonly generator: GeneratorIdentity;
  readonly dependencies: readonly LockedDependency[];
  /** Durable decision facts needed to explain the locked resolution. */
  readonly resolutionDecisions: readonly ResolutionDecision[];
  /** Digest over the generated inputs / template bundle used to materialize. */
  readonly materializationInputsDigest: Digest;
  readonly target?: TargetPlatform;
}

/** Remaining lock inputs beyond the resolved configuration's own identity. */
export interface ConfigurationLockInput {
  readonly materializationInputsDigest: Digest;
  readonly target?: TargetPlatform;
  /**
   * Optional approved lock. When present, lock creation is a hostile boundary
   * that fails closed with diagnostics (never throws) on any drift from it.
   */
  readonly approvedLock?: ConfigurationLock;
}

// --- Layer 4: materialization ----------------------------------------------

export type Ownership = "aifsd-owned" | "shared" | "user-owned";

export type ChangeClass =
  | "create"
  | "update-owned-region"
  | "merge"
  | "conflict"
  | "unchanged"
  | "delete"
  | "rename";

/** Stable semantic cause for a planned change. Presentation belongs to consumers. */
export type ChangeReasonCode =
  | "content-already-current"
  | "user-owned-content-conflict"
  | "user-owned-artifact-absent"
  | "shared-content-requires-merge"
  | "aifsd-owned-content-stale"
  | "rename-source-not-aifsd-owned"
  | "rename-destination-occupied"
  | "artifact-renamed"
  | "artifact-absent"
  | "artifact-no-longer-produced";

export interface PlannedChange {
  readonly path: string;
  readonly ownership: Ownership;
  readonly change: ChangeClass;
  /** Destination path for a `rename` change. */
  readonly renameTo?: string;
  readonly reasonCode: ChangeReasonCode;
  /** Explicit content to write for actionable changes. */
  readonly content?: string;
  /** Recomputed target content digest (never caller-supplied). */
  readonly contentDigest?: Digest;
  /** Required precondition: expected current on-disk digest; null means expected absent. */
  readonly expectedCurrentDigest: Digest | null;
}

export interface ChangePlan {
  readonly lockDigest: Digest;
  /** Canonical identity of the reviewed preview, excluding this field itself. */
  readonly planDigest: Digest;
  readonly changes: readonly PlannedChange[];
}

/** Renderer-neutral facts captured by the planner for one native change. */
export interface ChangeDecision {
  readonly kind: "planned-change";
  readonly path: string;
  readonly change: ChangeClass;
  readonly ownership: Ownership;
  readonly reasonCode: ChangeReasonCode;
  readonly renameTo?: string;
  readonly contentDigest?: Digest;
  readonly expectedCurrentDigest: Digest | null;
}

export type ConfigurationDecision = ResolutionDecision | ChangeDecision;

export interface WorkspaceArtifact {
  readonly path: string;
  readonly contentDigest: Digest;
  readonly ownership: Ownership;
}

export interface WorkspaceState {
  readonly artifacts: readonly WorkspaceArtifact[];
}

/** Desired AIFSD-owned output the plan reconciles the workspace toward. */
export interface DesiredArtifact {
  readonly path: string;
  readonly ownership: Ownership;
  /** Explicit desired content; the planner recomputes its digest. */
  readonly content: string;
  /** Optional prior path, marking an intended rename. */
  readonly previousPath?: string;
}

export interface ChangePlanInput {
  readonly lock: ConfigurationLock;
  readonly desired: readonly DesiredArtifact[];
  readonly workspace: WorkspaceState;
}

export type ChangeApplicationStatus = "applied" | "skipped" | "conflict";

/** Applies approved changes; must recheck observed digests against the lock. */
export interface ArtifactWriter {
  readonly observe: (path: string) => MaybePromise<Digest | null>;
  readonly apply: (change: PlannedChange) => MaybePromise<ChangeApplicationStatus>;
}

export interface ApplyDependencies {
  readonly writer: ArtifactWriter;
  /** Approved lock; materialize fails closed unless contentDigest(lock) === plan.lockDigest. */
  readonly lock: ConfigurationLock;
  /** Plan identity captured by the approval boundary after preview. */
  readonly approvedPlanDigest: Digest;
}

export interface ApplyResult {
  readonly applied: readonly PlannedChange[];
  readonly skipped: readonly PlannedChange[];
  readonly conflicts: readonly PlannedChange[];
}
