import type { ContractVersion, EventId, InvocationContext, JsonValue, RunId } from "#contracts";
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
}

export interface AgentRunIdentity {
  readonly runId: RunId;
  readonly parentRunId?: RunId;
  readonly causalRunId?: RunId;
}

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

export interface AgentRunner {
  capabilities(): MaybePromise<AgentRunnerProfile>;
  prepare(definition: AgentDefinition): MaybePromise<PreparedAgentDefinition>;
  start(request: AgentStartRequest): MaybePromise<AgentRun>;
  resume?(request: AgentResumeRequest): MaybePromise<AgentRun>;
}

export interface AgentResumeConfiguration {
  readonly compatibility: ResumeCompatibility;
}
