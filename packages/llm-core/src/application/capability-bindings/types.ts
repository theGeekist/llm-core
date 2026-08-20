import type {
  CapabilityBinding,
  CapabilityClaim,
  CapabilityConstraint,
  CapabilityRequirement,
  ConformanceEvidence,
  PortableImplementationId,
} from "#contracts";
import type { AgentRunner, LocalSkillLoader } from "../../features/agent/public";
import type {
  ApprovalAuthenticationPort,
  ConcurrencyGate,
  PolicyEvaluationPort,
} from "../../features/control/runtime";
import type { EventSink, ToolReceiptJournal } from "../../features/evidence/public";
import type { Indexer, VectorStore } from "../../features/indexing/public";
import type { Model, ModelOutputParser } from "../../features/model/public";
import type { SchemaDocumentResolver } from "../../features/model/runtime";
import type {
  ImageGenerationPort,
  MediaOutputProjector,
  MediaResourceResolver,
  SpeechGenerationPort,
  TranscriptionPort,
} from "../../features/media/public";
import type { ConversationStateStore, ConversationStore } from "../../features/memory/public";
import type {
  DocumentLoader,
  DocumentTransformer,
  Embedder,
  QueryEngine,
  Reranker,
  ResponseSynthesizer,
  Retriever,
  TextSplitter,
} from "../../features/retrieval/public";
import type { CacheStore, KeyValueStore, ResourceStore } from "../../features/storage/public";
import type {
  ActionDigestPort,
  ToolArgumentValidationPort,
  ExecutableTool,
  ToolSchemaDigestPort,
} from "../../features/tooling/runtime";
import type { MaybePromise } from "../../shared/maybe";

/**
 * The closed set of live feature ports assembled by composition.
 *
 * Provider/framework factories and generic construct records deliberately have
 * no representation here. New port kinds require an explicit architecture
 * change and a typed entry in this map.
 */
export interface CapabilityPortMap {
  model: Model;
  "model-output-parser": ModelOutputParser;
  "schema-document-resolver": SchemaDocumentResolver;
  tool: ExecutableTool;
  "action-digest": ActionDigestPort;
  "tool-schema-digest": ToolSchemaDigestPort;
  "tool-argument-validation": ToolArgumentValidationPort;
  "policy-evaluation": PolicyEvaluationPort;
  "approval-authentication": ApprovalAuthenticationPort;
  concurrency: ConcurrencyGate;
  "event-sink": EventSink;
  "tool-receipt-journal": ToolReceiptJournal;
  "agent-runner": AgentRunner;
  "local-skill-loader": LocalSkillLoader;
  "document-loader": DocumentLoader;
  "document-transformer": DocumentTransformer;
  "text-splitter": TextSplitter;
  embedder: Embedder;
  retriever: Retriever;
  reranker: Reranker;
  "query-engine": QueryEngine;
  "response-synthesizer": ResponseSynthesizer;
  indexer: Indexer;
  "vector-store": VectorStore;
  "resource-store": ResourceStore;
  "key-value-store": KeyValueStore;
  "cache-store": CacheStore;
  "conversation-store": ConversationStore;
  "conversation-state-store": ConversationStateStore;
  "image-generation": ImageGenerationPort;
  "speech-generation": SpeechGenerationPort;
  transcription: TranscriptionPort;
  "media-resource-resolver": MediaResourceResolver;
  "media-output-projector": MediaOutputProjector;
}

export type CapabilityPortKind = keyof CapabilityPortMap;

export interface RuntimeCapabilityBinding<TKind extends CapabilityPortKind> {
  readonly kind: TKind;
  readonly descriptor: CapabilityBinding;
  readonly port: CapabilityPortMap[TKind];
}

export type AnyRuntimeCapabilityBinding = {
  [TKind in CapabilityPortKind]: RuntimeCapabilityBinding<TKind>;
}[CapabilityPortKind];

declare const registeredRuntimeBindingBrand: unique symbol;

export interface RegisteredRuntimeCapabilityBinding<
  TKind extends CapabilityPortKind = CapabilityPortKind,
> extends RuntimeCapabilityBinding<TKind> {
  readonly [registeredRuntimeBindingBrand]: true;
}

export type AnyRegisteredRuntimeCapabilityBinding = {
  [TKind in CapabilityPortKind]: RegisteredRuntimeCapabilityBinding<TKind>;
}[CapabilityPortKind];

/** Immutable planning input. It contains identity and evidence, never a live port or factory. */
export interface CapabilityCandidateDescriptor<
  TKind extends CapabilityPortKind = CapabilityPortKind,
> {
  readonly kind: TKind;
  readonly descriptor: CapabilityBinding;
}

export type AnyCapabilityCandidateDescriptor = {
  [TKind in CapabilityPortKind]: CapabilityCandidateDescriptor<TKind>;
}[CapabilityPortKind];

declare const registeredCapabilityCandidateBrand: unique symbol;

export interface RegisteredCapabilityCandidate<
  TKind extends CapabilityPortKind = CapabilityPortKind,
> extends CapabilityCandidateDescriptor<TKind> {
  readonly [registeredCapabilityCandidateBrand]: true;
}

export type AnyRegisteredCapabilityCandidate = {
  [TKind in CapabilityPortKind]: RegisteredCapabilityCandidate<TKind>;
}[CapabilityPortKind];

/** A callable acquisition boundary kept separate from the inert planning descriptor. */
export interface CapabilityAcquisitionFactory<
  TKind extends CapabilityPortKind = CapabilityPortKind,
> {
  readonly kind: TKind;
  readonly bindingId: PortableImplementationId;
  readonly acquire: () => MaybePromise<CapabilityAcquiredPort<TKind>>;
}

export interface CapabilityAcquiredPort<TKind extends CapabilityPortKind = CapabilityPortKind> {
  readonly port: CapabilityPortMap[TKind];
  readonly release?: () => MaybePromise<void>;
}

export type AnyCapabilityAcquisitionFactory = {
  [TKind in CapabilityPortKind]: CapabilityAcquisitionFactory<TKind>;
}[CapabilityPortKind];

declare const registeredAcquisitionFactoryBrand: unique symbol;

export interface RegisteredCapabilityAcquisitionFactory<
  TKind extends CapabilityPortKind = CapabilityPortKind,
> {
  /** Opaque proof with kind correlation that exposes neither identity strings nor a callable. */
  readonly [registeredAcquisitionFactoryBrand]: TKind;
}

export type AnyRegisteredCapabilityAcquisitionFactory = {
  [TKind in CapabilityPortKind]: RegisteredCapabilityAcquisitionFactory<TKind>;
}[CapabilityPortKind];

export interface CapabilityAcquisitionFactoryVerificationInput<
  TKind extends CapabilityPortKind = CapabilityPortKind,
> {
  readonly kind: TKind;
  readonly bindingId: PortableImplementationId;
  readonly acquire: CapabilityAcquisitionFactory<TKind>["acquire"];
}

export type CapabilityAcquisitionFactoryVerifier = (
  input: CapabilityAcquisitionFactoryVerificationInput,
) => boolean;

export interface AcquiredCapabilityBindings {
  readonly bindings: readonly AnyRegisteredRuntimeCapabilityBinding[];
  /** Releases acquired resources in reverse acquisition order. Safe to invoke once. */
  readonly release: () => MaybePromise<void>;
}

export interface CapabilityCandidateEvidenceVerificationInput {
  readonly bindingId: PortableImplementationId;
  readonly kind: CapabilityPortKind;
  readonly claim: CapabilityClaim;
  readonly evidence: ConformanceEvidence;
}

export type CapabilityCandidateEvidenceVerifier = (
  input: CapabilityCandidateEvidenceVerificationInput,
) => boolean;

export interface CapabilityCandidateDependencies {
  readonly verifyEvidence: CapabilityCandidateEvidenceVerifier;
  readonly verifyAcquisitionFactory: CapabilityAcquisitionFactoryVerifier;
  readonly evaluateCondition?: CapabilityConditionEvaluator;
}

export interface CapabilityEvidenceVerificationInput {
  readonly bindingId: PortableImplementationId;
  readonly kind: CapabilityPortKind;
  /** Exact live implementation identity supplied by composition. */
  readonly implementationToken: object;
  readonly claim: CapabilityClaim;
  readonly evidence: ConformanceEvidence;
}

export type CapabilityEvidenceVerifier = (input: CapabilityEvidenceVerificationInput) => boolean;

export interface CapabilityConditionEvaluationInput {
  readonly bindingId: PortableImplementationId;
  readonly kind: CapabilityPortKind;
  readonly claim: CapabilityClaim;
  readonly requirement: CapabilityRequirement;
  readonly constraint: CapabilityConstraint;
}

export type CapabilityConditionEvaluator = (input: CapabilityConditionEvaluationInput) => boolean;

export interface CapabilityBindingDependencies {
  readonly verifyEvidence: CapabilityEvidenceVerifier;
  readonly evaluateCondition?: CapabilityConditionEvaluator;
}

export interface CapabilityPortRequirement<TKind extends CapabilityPortKind = CapabilityPortKind> {
  readonly kind: TKind;
  /** Exact configured binding selection. It never falls through to another binding. */
  readonly bindingId?: PortableImplementationId;
  /** Additional behavior that the selected port must prove. */
  readonly capabilities?: readonly CapabilityRequirement[];
}

export interface CapabilityCandidateResolutionRequest {
  readonly requirements: readonly CapabilityPortRequirement[];
  readonly candidates: readonly AnyRegisteredCapabilityCandidate[];
  /** Explicit composition-owned defaults, keyed by the neutral port kind. */
  readonly defaults?: Partial<Record<CapabilityPortKind, PortableImplementationId>>;
}

export type CapabilityBindingDiagnosticCode =
  | "ambiguous-binding"
  | "conditional-unproven"
  | "duplicate-binding"
  | "duplicate-requirement"
  | "incompatible-binding"
  | "invalid-binding"
  | "missing-binding"
  | "selected-default"
  | "selected-exact"
  | "selected-unique"
  | "unknown-binding"
  | "unsupported-version-range";

export interface CapabilityBindingDiagnostic {
  readonly code: CapabilityBindingDiagnosticCode;
  readonly kind: CapabilityPortKind;
  readonly bindingId?: PortableImplementationId;
  readonly capabilityId?: string;
}

export type CapabilityCandidateResolutionOutcome =
  | {
      readonly kind: "resolved";
      readonly candidates: readonly AnyRegisteredCapabilityCandidate[];
      readonly diagnostics: readonly CapabilityBindingDiagnostic[];
    }
  | {
      readonly kind: "unresolved";
      readonly diagnostics: readonly CapabilityBindingDiagnostic[];
    };
