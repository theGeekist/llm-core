import type { EventId, JsonValue, RunId } from "#contracts";
import type { MaybePromise } from "#shared/maybe";
import type {
  ControlledToolExecutionOutcome,
  ExecuteControlledToolInput,
} from "../tool-execution/public";
import type {
  AgentRun,
  AgentProgressFacts,
  AgentRunIdentity,
  AgentRunRequest,
  AgentRunnerCapabilities,
  PreparedAgentSpec,
  RunResult,
} from "../../features/agent/public";
import type {
  InterventionDecision,
  InterventionRequest,
  RegisteredResumableCheckpoint,
  ResumeCompatibility,
} from "../../features/state/public";

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
  readonly status: RunResult["status"];
  readonly output?: JsonValue;
  readonly reasonCode?: string;
  readonly providerSession?: RunResult["providerSession"];
  readonly checkpoint?: RunResult["checkpoint"];
  readonly durableExecution?: RunResult["durableExecution"];
}

export interface LocalAgentExecutionContext {
  readonly identity: AgentRunIdentity;
  readonly request: AgentRunRequest;
  readonly cancellation: LocalAgentCancellationSignal;
  readonly controlledToolExecution?: ControlledAgentToolExecutionPort;
  emitProgress(facts: AgentProgressFacts): MaybePromise<void>;
  startChild(request: AgentRunRequest): MaybePromise<AgentRun>;
  requestIntervention(request: InterventionRequest): MaybePromise<void>;
  receivedInterventions(): readonly InterventionDecision[];
}

export interface LocalAgentProgramPort {
  execute(context: LocalAgentExecutionContext): MaybePromise<LocalAgentExecutionResult>;
  resume?(
    context: LocalAgentExecutionContext,
    checkpoint: RegisteredResumableCheckpoint,
  ): MaybePromise<LocalAgentExecutionResult>;
}

export interface CreateLocalAgentRunnerOptions {
  readonly identity: AgentRunIdentityPort;
  readonly program: LocalAgentProgramPort;
  readonly runnerId: string;
  readonly runnerVersion: AgentRunnerCapabilities["runnerVersion"];
  readonly controlledToolExecution?: ControlledAgentToolExecutionPort;
  readonly interventions?: boolean;
  readonly resumeCompatibility?: ResumeCompatibility;
}

export interface LocalAgentPreparedRequest {
  readonly agent: PreparedAgentSpec;
}
