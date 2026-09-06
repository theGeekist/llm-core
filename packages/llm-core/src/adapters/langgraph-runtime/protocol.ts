import type { EventId, JsonValue, RunId } from "#contracts";
import type { AgentOutput } from "../../features/agent/public";

export interface LangGraphAdapterState {
  readonly agentId: string;
  readonly agentVersion: string;
  readonly instructions: string;
  readonly input: JsonValue;
  readonly output?: AgentOutput;
}

export interface LangGraphRunnableConfig {
  readonly configurable: { readonly thread_id: string };
  readonly signal: AbortSignal;
}

export interface LangGraphCompiledGraphPort {
  invoke(input: LangGraphAdapterState, config: LangGraphRunnableConfig): Promise<unknown>;
  getState?(config: Pick<LangGraphRunnableConfig, "configurable">): Promise<unknown>;
}

export interface LangGraphIdentityPort {
  runId(): RunId;
  eventId(): EventId;
  now(): string;
}

export interface LangGraphRuntimeOptions {
  readonly graph: LangGraphCompiledGraphPort;
  readonly identity: LangGraphIdentityPort;
  readonly sourceContract: {
    readonly authority: "@langchain/langgraph";
    readonly version: "1.0.7";
    readonly revision: "npm:@langchain/langgraph@1.0.7";
  };
}

export type LangGraphNativeRunStatus =
  | "running"
  | "completed"
  | "interrupted"
  | "cancelled"
  | "failed";

interface LangGraphNativeRunObservationBase {
  readonly sourceContract: LangGraphRuntimeOptions["sourceContract"];
  readonly threadId: string;
  readonly status: LangGraphNativeRunStatus;
}

export interface LangGraphNativeStateObservation extends LangGraphNativeRunObservationBase {
  readonly stateAvailability: "available";
  readonly checkpointId?: string;
  readonly next: readonly string[];
  readonly interruptCount: number;
}

export interface LangGraphNativeErrorObservation extends LangGraphNativeRunObservationBase {
  readonly stateAvailability: "unavailable";
  readonly nativeError: {
    readonly operation: "native.langgraph.graph.invoke" | "native.langgraph.state.read";
    readonly code: "abort" | "invocation-rejected" | "state-unavailable";
  };
}

export type LangGraphNativeRunObservation =
  | LangGraphNativeStateObservation
  | LangGraphNativeErrorObservation;
