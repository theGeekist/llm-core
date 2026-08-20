import type {
  CorrelationId,
  Digest,
  EventId,
  EvidenceId,
  JsonValue,
} from "@geekist/llm-core/contracts";

export type MaybePromise<T> = T | PromiseLike<T>;

export type { CorrelationId, Digest, EventId, EvidenceId, JsonValue };

export type ProjectAuthorityKind = "human" | "coordinator" | "worker" | "integration" | "plugin";

export interface ProjectAuthority {
  readonly authorityId: string;
  readonly kind: ProjectAuthorityKind;
  readonly delegationId?: string;
}

export interface ProjectProvenance {
  readonly sourceKind: "human" | "repository" | "tool" | "worker" | "integration";
  readonly sourceRef: string;
  readonly revision?: string;
  readonly contentDigest?: Digest;
}

export type ProjectEventKind =
  | "observation.accepted"
  | "decision.accepted"
  | "assertions.recorded"
  | "assertions.retracted"
  | "correction.accepted"
  | "reversal.accepted";

export interface ProjectObservation {
  readonly observationId: string;
  readonly projectId: string;
  readonly kind: ProjectEventKind;
  readonly sourceAuthority: ProjectAuthority;
  readonly provenance: ProjectProvenance;
  readonly evidence: readonly EvidenceId[];
  readonly causationId?: EventId;
  readonly correlationId: CorrelationId;
  readonly observedAt: string;
  readonly payload: JsonValue;
}

export interface AdmissionDecision {
  readonly decisionId: string;
  readonly authority: ProjectAuthority;
  readonly policyId: string;
  readonly decidedAt: string;
}

export interface AdmissionRequest {
  readonly eventId: EventId;
  readonly observation: ProjectObservation;
}

export interface AdmissionAuthority {
  readonly authorityId: string;
  readonly decide: (request: AdmissionRequest) => MaybePromise<AdmissionDecision | null>;
}

export interface AcceptedProjectEvent {
  readonly eventId: EventId;
  readonly projectId: string;
  readonly kind: ProjectEventKind;
  readonly sourceAuthority: ProjectAuthority;
  readonly admission: AdmissionDecision;
  readonly provenance: ProjectProvenance;
  readonly evidence: readonly EvidenceId[];
  readonly causationId?: EventId;
  readonly correlationId: CorrelationId;
  readonly observedAt: string;
  readonly admittedAt: string;
  readonly payload: JsonValue;
  readonly payloadDigest: Digest;
  readonly eventDigest: Digest;
}

declare const projectAdmissionReceipt: unique symbol;

/**
 * An accepted event carrying the runtime capability minted by the admission
 * boundary. Structural casts cannot mint a receipt: the journal also verifies
 * the module-private runtime receipt before append.
 */
export type ProjectAdmissionReceipt = AcceptedProjectEvent & {
  readonly [projectAdmissionReceipt]: true;
};

export interface ProjectContentDigester {
  readonly digest: (value: unknown) => MaybePromise<Digest>;
}

export type ProjectDiagnosticCode =
  | "invalid-observation"
  | "invalid-admission"
  | "admission-denied"
  | "event-integrity-failed"
  | "journal-conflict"
  | "causation-missing"
  | "assertion-invalid"
  | "projection-drift";

export type ProjectDiagnosticReasonCode =
  | "non-portable-input"
  | "required-field-missing"
  | "invalid-identifier"
  | "invalid-timestamp"
  | "unexpected-field"
  | "evidence-required"
  | "authority-mismatch"
  | "authority-denied"
  | "admission-receipt-required"
  | "admission-time-regressed"
  | "payload-digest-mismatch"
  | "event-digest-mismatch"
  | "event-id-conflict"
  | "causation-not-admitted"
  | "assertion-shape-invalid"
  | "assertion-source-mismatch"
  | "projection-checkpoint-stale"
  | "projection-protocol-mismatch"
  | "projection-missing"
  | "projection-divergent"
  | "projection-unauthorised";

export interface ProjectDiagnostic {
  readonly code: ProjectDiagnosticCode;
  readonly reasonCode: ProjectDiagnosticReasonCode;
  readonly path?: string;
}

export type ProjectResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly ProjectDiagnostic[] };

export interface JournalCheckpoint {
  readonly projectId: string;
  readonly position: number;
  readonly lastEventId: EventId | null;
  readonly journalDigest: Digest;
}

export type JournalAppendDisposition = "appended" | "already-present";

export interface JournalAppendResult {
  readonly disposition: JournalAppendDisposition;
  readonly event: AcceptedProjectEvent;
  readonly checkpoint: JournalCheckpoint;
}

export interface ProjectEventJournal {
  readonly append: (
    receipt: ProjectAdmissionReceipt,
  ) => Promise<ProjectResult<JournalAppendResult>>;
  readonly read: (projectId: string) => Promise<readonly AcceptedProjectEvent[]>;
  readonly checkpoint: (projectId: string) => Promise<JournalCheckpoint>;
}

export interface ProjectAssertion {
  readonly assertionId: string;
  readonly subjectId: string;
  readonly predicate: string;
  readonly object: JsonValue;
  readonly sourceEventId: EventId;
  readonly authority: ProjectAuthority;
  readonly evidence: readonly EvidenceId[];
  readonly validFrom: string;
  readonly validTo?: string;
}

export interface AssertionRecordPayload {
  readonly assertions: readonly Omit<ProjectAssertion, "sourceEventId">[];
}

export interface AssertionRetractionPayload {
  readonly assertionIds: readonly string[];
}

export interface MaterialisedAssertion extends ProjectAssertion {
  readonly retractedBy: EventId | null;
}

export type TaskCompletion = "complete" | "incomplete" | "unknown" | "contradictory";

export interface DerivedTaskState {
  readonly taskId: string;
  readonly readiness: "ready" | "blocked" | "complete" | "contradictory";
  readonly completion: TaskCompletion;
  readonly dependencies: readonly string[];
  readonly blockers: readonly string[];
  readonly preconditionAssertionIds: readonly string[];
  readonly contradictionAssertionIds: readonly string[];
  readonly sourceEventIds: readonly EventId[];
}

export const PROJECT_PROJECTION_PROTOCOL_VERSION = "aifsd.project-projection/1";

export interface ProjectedAssertion {
  readonly assertion: MaterialisedAssertion;
  readonly canonicalDigest: Digest;
}

export interface ProjectProjection {
  readonly projectId: string;
  readonly protocolVersion: typeof PROJECT_PROJECTION_PROTOCOL_VERSION;
  readonly checkpoint: JournalCheckpoint;
  readonly assertions: readonly ProjectedAssertion[];
  readonly tasks: readonly DerivedTaskState[];
  readonly projectionDigest: Digest;
}

export type ProjectionDriftKind = "missing" | "divergent" | "stale" | "unauthorised";

export interface ProjectionDrift {
  readonly kind: ProjectionDriftKind;
  readonly identity: string;
  readonly expectedDigest?: Digest;
  readonly actualDigest?: Digest;
}

export interface ProjectionReconciliationReport {
  readonly projectId: string;
  readonly protocolVersion: typeof PROJECT_PROJECTION_PROTOCOL_VERSION;
  readonly journalCheckpoint: JournalCheckpoint;
  readonly expectedProjectionDigest: Digest;
  readonly actualProjectionDigest: Digest | null;
  readonly drift: readonly ProjectionDrift[];
  readonly reconciled: boolean;
}

export interface ProjectTemporalQuery {
  readonly projectId: string;
  readonly validAt: string;
}

export interface ProjectTemporalRelationship {
  readonly subjectId: string;
  readonly predicate: string;
  readonly objectId: string;
  readonly assertionId: string;
  readonly sourceEventId: EventId;
}

export interface ProjectTemporalQueryPort {
  readonly relationshipsAt: (
    query: ProjectTemporalQuery,
  ) => Promise<readonly ProjectTemporalRelationship[]>;
}

export interface RuntimeNeutralProjectView {
  readonly projectId: string;
  readonly journalCheckpoint: JournalCheckpoint;
  readonly projectionProtocolVersion: typeof PROJECT_PROJECTION_PROTOCOL_VERSION;
  readonly projectionDigest: Digest;
  readonly projectionFresh: boolean;
  readonly tasks: readonly DerivedTaskState[];
  readonly assertions: readonly ProjectedAssertion[];
  readonly reconciliation: ProjectionReconciliationReport | null;
}

export type ProjectCommand =
  | { readonly kind: "submit-observation"; readonly observation: ProjectObservation }
  | { readonly kind: "propose-decision"; readonly observation: ProjectObservation }
  | { readonly kind: "review-admission"; readonly request: AdmissionRequest };
