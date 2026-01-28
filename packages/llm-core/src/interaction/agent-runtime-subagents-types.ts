import type { EventStream } from "#adapters/types";
import type { MaybePromise } from "#shared/maybe";
import type { Outcome } from "#workflow/types";
import type { AgentRuntime, AgentRuntimeOptions } from "./agent-runtime";
import type { AgentEventState } from "./agent-runtime-events";

export type AgentSubagentOptions = {
  enabled?: boolean;
  maxActive?: number;
  idPrefix?: string;
};

export type AgentRuntimeFactory = (options: AgentRuntimeOptions) => AgentRuntime;

export type SubagentStatus = "idle" | "running" | "closed";

export type SubagentRecord = {
  id: string;
  runtime: AgentRuntime;
  status: SubagentStatus;
  lastOutcome?: MaybePromise<Outcome<unknown>> | null;
  name?: string | null;
  description?: string | null;
  tools?: string[] | null;
};

export type SubagentManager = {
  records: SubagentRecord[];
  maxActive: number;
  idPrefix: string;
  nextId: () => number;
  runtimeFactory: AgentRuntimeFactory;
  runtimeOptions: AgentRuntimeOptions;
  eventStream?: EventStream;
  eventState?: AgentEventState;
  interactionId: string;
};

export type SpawnInput = {
  agentId?: string | null;
  name?: string | null;
  description?: string | null;
  tools?: string[] | null;
};

export type SendInput = {
  agentId: string;
  text: string;
  context?: string;
  threadId?: string;
};

export type WaitInput = {
  agentId: string;
};

export type CloseInput = {
  agentId: string;
};

export const DEFAULT_MAX_ACTIVE = 4;
export const DEFAULT_ID_PREFIX = "subagent";
