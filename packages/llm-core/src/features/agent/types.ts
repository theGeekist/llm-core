import type {
  ContractVersion,
  ConversationId,
  CorrelationId,
  EventId,
  InvocationContext,
  JsonValue,
  PrincipalId,
  RunId,
} from "#contracts";
import type { MaybePromise } from "#shared/maybe";
import type {
  DurableExecutionHandle,
  InterventionDecision,
  InterventionRequest,
  ProviderSessionRef,
  ResumeCompatibility,
} from "../state/public";
import type { RegisteredResumableCheckpoint } from "../state/runtime";
import type { AgentSkillRef } from "./skills";
import type { AgentOutput } from "./result";

declare const preparedAgentDefinitionBrand: unique symbol;
declare const registeredNativeAgentConversationProfileBrand: unique symbol;
declare const admittedAgentActiveInputBrand: unique symbol;

export type AgentEffectRequirement = "read-only" | "controlled";

export interface AgentDefinition {
  readonly agentId: string;
  readonly version: ContractVersion;
  readonly instructions: string;
  readonly effectRequirement: AgentEffectRequirement;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
  readonly skills?: readonly AgentSkillRef[];
}

export interface PreparedAgentDefinition extends AgentDefinition {
  readonly [preparedAgentDefinitionBrand]: true;
}

export interface AgentRunnerProfile {
  readonly runnerId: string;
  readonly runnerVersion: ContractVersion;
  readonly controlledEffects: boolean;
  readonly cancellation: "none" | "cooperative";
  readonly interventions: boolean;
  readonly checkpointResume: boolean;
  readonly providerSessionContinuation: boolean;
  readonly durableExecutionSignalling: boolean;
  readonly childRuns: boolean;
  readonly nativeConversation?: RegisteredNativeAgentConversationProfile;
}

export type NativeAgentOperationId =
  | "conversation.start"
  | "conversation.continue"
  | "run.observe"
  | "run.input.submit"
  | "run.cancel";

export type NativeAgentOperationDisposition = "supported" | "unsupported" | "not-applicable";
export type AgentActiveInputDeliveryMode = "native-live" | "execution-boundary";
export type NativeAgentUnsupportedReasonCode =
  | "not-implemented"
  | "qualification-failed"
  | "version-drift"
  | "observability-insufficient"
  | "provider-unsupported";

interface NativeAgentOperationBase<TOperation extends NativeAgentOperationId> {
  readonly operation: TOperation;
}

type NativeAgentSupportedOperation<TOperation extends NativeAgentOperationId> =
  NativeAgentOperationBase<TOperation> & {
    readonly disposition: "supported";
    readonly evidenceRefs: readonly [string, ...string[]];
  } & (TOperation extends "run.input.submit"
      ? { readonly deliveryMode: AgentActiveInputDeliveryMode }
      : { readonly deliveryMode?: never });

type NativeAgentUnavailableOperation<TOperation extends NativeAgentOperationId> =
  | (NativeAgentOperationBase<TOperation> & {
      readonly disposition: "unsupported";
      readonly reasonCode: NativeAgentUnsupportedReasonCode;
      readonly deliveryMode?: never;
    })
  | (NativeAgentOperationBase<TOperation> & {
      readonly disposition: "not-applicable";
      readonly evidenceRefs: readonly [string, ...string[]];
      readonly deliveryMode?: never;
    });

export type NativeAgentOperationDeclaration<TOperation extends NativeAgentOperationId> =
  | NativeAgentSupportedOperation<TOperation>
  | NativeAgentUnavailableOperation<TOperation>;

export type NativeAgentOperationMatrix = readonly [
  NativeAgentOperationDeclaration<"conversation.start">,
  NativeAgentOperationDeclaration<"conversation.continue">,
  NativeAgentOperationDeclaration<"run.observe">,
  NativeAgentOperationDeclaration<"run.input.submit">,
  NativeAgentOperationDeclaration<"run.cancel">,
];

export interface NativeAgentSourceContract {
  readonly authority: string;
  readonly version: string;
  readonly revision: string;
}

export interface NativeAgentConversationProfile {
  readonly providerId: string;
  readonly routeProfileId: string;
  readonly routeProfileVersion: ContractVersion;
  readonly sourceContract: NativeAgentSourceContract;
  readonly operations: NativeAgentOperationMatrix;
}

export interface RegisteredNativeAgentConversationProfile extends NativeAgentConversationProfile {
  readonly [registeredNativeAgentConversationProfileBrand]: true;
}

export interface NativeAgentConversationContinuity {
  readonly providerId: string;
  readonly routeProfileId: string;
  readonly routeProfileVersion: ContractVersion;
}

export interface AgentRunIdentity {
  readonly runId: RunId;
  readonly parentRunId?: RunId;
  readonly causalRunId?: RunId;
}

export interface AgentActiveInputRequest {
  readonly messageId: string;
  readonly correlationId: CorrelationId;
  readonly submittedAt: string;
  readonly content: JsonValue;
}

export interface AgentActiveInputAuthorityScope {
  readonly operation: "run.input.submit";
  readonly conversationId: ConversationId;
  readonly runId: RunId;
}

export interface AgentActiveInputAuthorityCapability {
  readonly kind: "agent-active-input-authority";
  readonly authorityId: string;
  readonly issuer: PrincipalId;
  readonly scope: AgentActiveInputAuthorityScope;
  readonly revision: number;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export type AgentActiveInputAuthorityVerification =
  | {
      readonly status: "verified";
      readonly issuer: PrincipalId;
      readonly revision: number;
    }
  | { readonly status: "forged" }
  | { readonly status: "unauthorised" };

export interface AgentActiveInputAuthorityVerificationInput {
  readonly authority: AgentActiveInputAuthorityCapability;
  readonly conversationId: ConversationId;
  readonly runId: RunId;
  readonly now: string;
}

export interface AgentActiveInputAuthorityVerifier {
  verify(
    input: AgentActiveInputAuthorityVerificationInput,
  ): MaybePromise<AgentActiveInputAuthorityVerification>;
}

export interface AgentActiveInputClock {
  now(): string;
}

export interface AgentActiveInputAuthorityReceipt {
  readonly authorityId: string;
  readonly issuer: PrincipalId;
  readonly scope: AgentActiveInputAuthorityScope;
  readonly revision: number;
  readonly admittedAt: string;
  readonly expiresAt: string;
}

export interface AdmittedAgentActiveInput extends AgentActiveInputRequest {
  readonly authorityReceipt: AgentActiveInputAuthorityReceipt;
  readonly [admittedAgentActiveInputBrand]: true;
}

export type AgentActiveInputRejectionReasonCode =
  | "forged-authority"
  | "unauthorised"
  | "stale-authority"
  | "duplicate-input"
  | "provider-rejected";

export type AgentActiveInputAdmission =
  | { readonly status: "admitted"; readonly input: AdmittedAgentActiveInput }
  | {
      readonly status: "rejected";
      readonly request: AgentActiveInputRequest;
      readonly reasonCode: Exclude<AgentActiveInputRejectionReasonCode, "provider-rejected">;
    };

interface AgentActiveInputAcknowledgementBase {
  readonly messageId: string;
  readonly correlationId: CorrelationId;
  readonly acknowledgedAt: string;
}

export type AgentActiveInputAcknowledgement =
  | (AgentActiveInputAcknowledgementBase & { readonly status: "accepted" })
  | (AgentActiveInputAcknowledgementBase & { readonly status: "already-terminal" })
  | (AgentActiveInputAcknowledgementBase & { readonly status: "unsupported" })
  | (AgentActiveInputAcknowledgementBase & {
      readonly status: "rejected";
      readonly reasonCode: AgentActiveInputRejectionReasonCode;
    });

interface AgentActiveInputEvidenceBase {
  readonly messageId: string;
  readonly correlationId: CorrelationId;
}

export interface AgentActiveInputIdentity {
  readonly messageId: string;
  readonly correlationId: CorrelationId;
}

export type AgentActiveInputProcessingEvidence =
  | (AgentActiveInputEvidenceBase & {
      readonly status: "recipient-observed";
      readonly observedAt: string;
      readonly evidenceRef: string;
    })
  | (AgentActiveInputEvidenceBase & {
      readonly status: "processing-observed";
      readonly observedAt: string;
      readonly causationRef: string;
    })
  | (AgentActiveInputEvidenceBase & {
      readonly status: "unavailable";
      readonly stage: "recipient-observation" | "semantic-processing";
      readonly declaredAt: string;
      readonly reasonCode: "provider-unobservable" | "evidence-not-retained";
    });

export interface AgentStartRequest {
  readonly agent: PreparedAgentDefinition;
  readonly invocationContext: InvocationContext;
  readonly input: JsonValue;
  readonly providerSession?: ProviderSessionRef;
}

export interface AgentResumeRequest {
  readonly agent: PreparedAgentDefinition;
  readonly invocationContext: InvocationContext;
  readonly checkpoint: RegisteredResumableCheckpoint;
}

export type AgentRunTerminalStatus = "completed" | "failed" | "denied" | "cancelled";

export interface AgentResult {
  readonly identity: AgentRunIdentity;
  readonly status: AgentRunTerminalStatus;
  readonly output?: AgentOutput;
  readonly reasonCode?: string;
  readonly providerSession?: ProviderSessionRef;
  readonly checkpoint?: RegisteredResumableCheckpoint;
  readonly durableExecution?: DurableExecutionHandle;
}

export interface AgentProgressFacts {
  readonly code: string;
}

export interface AgentInterventionRequestFacts {
  readonly interventionId: string;
  readonly checkpointId: string;
  readonly checkpointRevision: number;
  readonly runId: RunId;
  readonly stepId: string;
  readonly actionDigest: InterventionRequest["intervention"]["actionDigest"];
  readonly requestedAt: string;
  readonly expiresAt: string;
  readonly allowed: InterventionRequest["allowed"];
}

export interface AgentEventFactsByKind {
  readonly "agent.run.started": {
    readonly agentId: string;
    readonly agentVersion: ContractVersion;
  };
  readonly "agent.run.progress": AgentProgressFacts;
  readonly "agent.run.intervention.requested": AgentInterventionRequestFacts;
  readonly "agent.run.intervention.received": {
    readonly decision: InterventionDecision["decision"];
    readonly interventionId: string;
  };
  readonly "agent.run.cancellation.requested": {
    readonly requestedAt: string;
    readonly reasonProvided: boolean;
  };
  readonly "agent.run.cancellation.acknowledged": {
    readonly acknowledgedAt: string;
  };
  readonly "agent.run.input.accepted": {
    readonly messageId: string;
    readonly correlationId: CorrelationId;
    readonly acceptedAt: string;
    readonly deliveryMode: AgentActiveInputDeliveryMode;
  };
  readonly "agent.run.input.recipient-observed": {
    readonly messageId: string;
    readonly correlationId: CorrelationId;
    readonly observedAt: string;
    readonly evidenceRef: string;
  };
  readonly "agent.run.input.processing-observed": {
    readonly messageId: string;
    readonly correlationId: CorrelationId;
    readonly observedAt: string;
    readonly causationRef: string;
  };
  readonly "agent.run.input.evidence-unavailable": {
    readonly messageId: string;
    readonly correlationId: CorrelationId;
    readonly stage: "recipient-observation" | "semantic-processing";
    readonly declaredAt: string;
    readonly reasonCode: "provider-unobservable" | "evidence-not-retained";
  };
  readonly "agent.run.completed": { readonly status: "completed"; readonly reasonCode?: string };
  readonly "agent.run.failed": { readonly status: "failed"; readonly reasonCode?: string };
  readonly "agent.run.denied": { readonly status: "denied"; readonly reasonCode?: string };
  readonly "agent.run.cancelled": { readonly status: "cancelled"; readonly reasonCode?: string };
}

export type AgentEventKind = keyof AgentEventFactsByKind;

interface AgentEventBase {
  readonly eventId: EventId;
  readonly occurredAt: string;
  readonly sequence: number;
  readonly identity: AgentRunIdentity;
}

export type AgentEvent = {
  readonly [TKind in AgentEventKind]: AgentEventBase & {
    readonly kind: TKind;
    readonly facts: Readonly<AgentEventFactsByKind[TKind]>;
  };
}[AgentEventKind];

export interface AgentCancellationRequest {
  readonly requestedAt: string;
  readonly reason?: string;
}

export type AgentCancellationAcknowledgement =
  | { readonly status: "acknowledged"; readonly acknowledgedAt: string }
  | { readonly status: "already-terminal"; readonly acknowledgedAt: string }
  | { readonly status: "unsupported"; readonly acknowledgedAt: string };

export interface AgentInterventionAcknowledgement {
  readonly status: "accepted" | "already-terminal" | "rejected" | "unsupported";
  readonly acknowledgedAt: string;
}

export interface AgentRun {
  readonly identity: AgentRunIdentity;
  events(): AsyncIterable<AgentEvent>;
  result(): MaybePromise<AgentResult>;
  cancel(request: AgentCancellationRequest): MaybePromise<AgentCancellationAcknowledgement>;
  intervene(decision: InterventionDecision): MaybePromise<AgentInterventionAcknowledgement>;
}

export interface NativeAgentRun extends AgentRun {
  providerSession(): MaybePromise<ProviderSessionRef | undefined>;
  submitInput(input: AdmittedAgentActiveInput): MaybePromise<AgentActiveInputAcknowledgement>;
  activeInputEvidence(
    identity: AgentActiveInputIdentity,
  ): MaybePromise<AgentActiveInputProcessingEvidence>;
}

export interface AgentRunner {
  capabilities(): MaybePromise<AgentRunnerProfile>;
  prepare(definition: AgentDefinition): MaybePromise<PreparedAgentDefinition>;
  start(request: AgentStartRequest): MaybePromise<AgentRun>;
  resume?(request: AgentResumeRequest): MaybePromise<AgentRun>;
}

export interface NativeAgentRunner extends AgentRunner {
  capabilities(): MaybePromise<
    AgentRunnerProfile & {
      readonly nativeConversation: RegisteredNativeAgentConversationProfile;
    }
  >;
  start(request: AgentStartRequest): MaybePromise<NativeAgentRun>;
  resume?(request: AgentResumeRequest): MaybePromise<NativeAgentRun>;
}

export interface AgentResumeConfiguration {
  readonly compatibility: ResumeCompatibility;
}
