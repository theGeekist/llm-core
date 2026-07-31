import type { ContractVersion, EventId, JsonValue, RunId } from "#contracts";
import type { MaybePromise } from "#shared/maybe";
import type {
  ControlledToolExecutionOutcome,
  ExecuteControlledToolInput,
} from "../tool-execution/public";
import type {
  AgentRun,
  AgentProgressFacts,
  AgentRunIdentity,
  AgentStartRequest,
  AgentRunnerProfile,
  PreparedAgentDefinition,
  AgentResult,
} from "../../features/agent/public";
import type { ToolDeclaration } from "../../features/model/public";
import type {
  InterventionDecision,
  InterventionAuthenticationPort,
  InterventionRequest,
  ResumeCompatibility,
} from "../../features/state/public";
import type { RegisteredResumableCheckpoint } from "../../features/state/runtime";

export interface AgentRunIdentityPort {
  newRunId(): RunId;
  newEventId(): EventId;
  now(): string;
}

export interface LocalAgentCancellationSignal {
  isCancellationRequested(): boolean;
}

export interface ControlledAgentToolExecutionPort {
  execute(input: ExecuteControlledToolInput): MaybePromise<ControlledToolExecutionOutcome>;
}

export interface LocalAgentExecutionResult {
  readonly status: AgentResult["status"];
  readonly output?: JsonValue;
  readonly reasonCode?: string;
  readonly providerSession?: AgentResult["providerSession"];
  readonly checkpoint?: AgentResult["checkpoint"];
  readonly durableExecution?: AgentResult["durableExecution"];
}

export interface LocalAgentExecutionContext {
  readonly identity: AgentRunIdentity;
  readonly request: AgentStartRequest;
  readonly cancellation: LocalAgentCancellationSignal;
  readonly controlledToolExecution?: ControlledAgentToolExecutionPort;
  emitProgress(facts: AgentProgressFacts): MaybePromise<void>;
  startChild(request: AgentStartRequest): MaybePromise<AgentRun>;
  requestIntervention(request: InterventionRequest): MaybePromise<void>;
  receivedInterventions(): readonly InterventionDecision[];
}

export interface LocalAgentProgramPort {
  execute(context: LocalAgentExecutionContext): MaybePromise<LocalAgentExecutionResult>;
  resume?(input: LocalAgentProgramResumeInput): MaybePromise<LocalAgentExecutionResult>;
}

export interface LocalAgentProgramResumeInput {
  readonly context: LocalAgentExecutionContext;
  readonly checkpoint: RegisteredResumableCheckpoint;
}

/**
 * A model-visible child-agent capability.
 *
 * The expected agent identity is fixed at composition time while `resolve`
 * remains live so a child prepared by the composed runner can be supplied
 * after program construction.
 */
export interface DeclaredSubagentBinding {
  readonly declaration: Readonly<ToolDeclaration>;
  readonly agentId: string;
  readonly agentVersion: ContractVersion;
  readonly resolve: () => MaybePromise<PreparedAgentDefinition | undefined>;
}

export interface CreateLocalAgentRunnerOptions {
  readonly identity: AgentRunIdentityPort;
  readonly program: LocalAgentProgramPort;
  readonly runnerId: string;
  readonly runnerVersion: AgentRunnerProfile["runnerVersion"];
  readonly controlledToolExecution?: ControlledAgentToolExecutionPort;
  readonly interventions?: {
    readonly authentication: InterventionAuthenticationPort;
  };
  readonly resumeCompatibility?: ResumeCompatibility;
}

export interface LocalAgentPreparedRequest {
  readonly agent: PreparedAgentDefinition;
}
