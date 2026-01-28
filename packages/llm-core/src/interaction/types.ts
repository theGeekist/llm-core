import type {
  AdapterCallContext,
  EventStream,
  EventStreamEvent,
  Message,
  ModelStreamEvent,
  QueryStreamEvent,
} from "#adapters/types";
import type { PipelineDiagnostic, PipelinePaused, PipelineStep } from "@wpkernel/pipeline/core";
import type { DiagnosticEntry } from "#shared/reporting";
import type { MaybePromise } from "#shared/maybe";
import type { TraceEvent } from "#shared/reporting";
import type {
  ExecutionContextBase,
  PauseRequest,
  RunOptionsBase,
  TraceDiagnostics,
} from "#shared/types";

export type InteractionEventMeta = {
  sequence: number;
  timestamp: number;
  sourceId: string;
  correlationId?: string;
  interactionId?: string;
};

export type InteractionItemStatus = "in_progress" | "completed" | "failed";

export type InteractionItem = {
  id: string;
  details: InteractionItemDetails;
};

export type InteractionItemDetails =
  | { type: "agent_message"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "command_execution";
      command: string;
      aggregatedOutput?: string;
      exitCode?: number;
      status: InteractionItemStatus;
    }
  | {
      type: "file_change";
      changes: Array<{ path: string; kind: "add" | "delete" | "update" }>;
      status: InteractionItemStatus;
    }
  | {
      type: "mcp_tool_call";
      server: string;
      tool: string;
      arguments?: unknown;
      result?: { content?: unknown; structuredContent?: unknown };
      error?: { message: string };
      status: InteractionItemStatus;
    }
  | { type: "todo_list"; items: Array<{ text: string; completed: boolean }> }
  | { type: "error"; message: string };

export type InteractionItemEvent = {
  type: "started" | "updated" | "completed";
  item: InteractionItem;
};

export type InteractionSubagentEvent = {
  type: "selected" | "started" | "completed" | "failed";
  agent: {
    id: string;
    name: string;
    displayName?: string;
    description?: string;
    tools?: string[] | null;
  };
  toolCallId?: string;
  error?: string;
};

export type InteractionEvent =
  | { kind: "trace"; event: TraceEvent; meta: InteractionEventMeta }
  | { kind: "diagnostic"; entry: DiagnosticEntry; meta: InteractionEventMeta }
  | { kind: "model"; event: ModelStreamEvent; meta: InteractionEventMeta }
  | { kind: "query"; event: QueryStreamEvent; meta: InteractionEventMeta }
  | { kind: "item"; event: InteractionItemEvent; meta: InteractionEventMeta }
  | { kind: "subagent"; event: InteractionSubagentEvent; meta: InteractionEventMeta }
  | { kind: "event-stream"; event: EventStreamEvent; meta: InteractionEventMeta };

export type AgentApprovalPolicy = "never" | "on-request" | "unless-trusted" | "on-failure";

export type AgentApprovalsConfig = {
  policy?: AgentApprovalPolicy;
  cache?: "session";
};

export type AgentMcpServerConfig = {
  type?: "local" | "stdio" | "http" | "sse";
  tools: string[];
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export type AgentDefinition = {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  tools?: string[] | null;
  mcpServers?: Record<string, AgentMcpServerConfig>;
  infer?: boolean;
};

export type AgentLoopConfig = {
  agents?: AgentDefinition[];
  agentSelection?: {
    agentId?: string;
    allowInfer?: boolean;
  };
  skills?: {
    directories?: string[];
    disabled?: string[];
  };
  tools?: {
    allowlist?: string[];
    denylist?: string[];
  };
  mcpServers?: Record<string, AgentMcpServerConfig>;
  approvals?: AgentApprovalsConfig;
};

export type AgentLoopStateSnapshot = {
  selectedAgentId?: string;
  skills?: Array<{
    id: string;
    scope: "repo" | "user" | "system" | "admin";
    path: string;
    hash: string;
  }>;
  toolAllowlist?: string[] | null;
  approvalCacheKeys?: string[];
};

export type InteractionState = TraceDiagnostics & {
  messages: Message[];
  events?: InteractionEvent[];
  lastSequence?: number;
  private?: {
    raw?: Record<string, unknown>;
    pause?: InteractionPauseRequest;
    streams?: Record<string, unknown>;
  };
};

export type InteractionReducer = (
  state: InteractionState,
  event: InteractionEvent,
) => InteractionState;

export type InteractionInput = {
  message?: Message;
  state?: InteractionState;
  interactionId?: string;
  correlationId?: string;
};

export type InteractionRunOptions = RunOptionsBase & {
  input: InteractionInput;
  reducer?: InteractionReducer;
  eventStream?: EventStream;
};

export type InteractionPauseRequest = PauseRequest;

export type InteractionRunResult = {
  readonly artefact: InteractionState;
  readonly diagnostics: readonly PipelineDiagnostic[];
  readonly steps: readonly PipelineStep[];
  readonly context: InteractionContext;
  readonly state: Record<string, unknown>;
};

export type InteractionRunOutcome = InteractionRunResult | PipelinePaused<Record<string, unknown>>;

export type InteractionContext = ExecutionContextBase & {
  reducer: InteractionReducer;
  eventStream?: EventStream;
};

export type SessionId = string | { sessionId: string; userId?: string };

export type SessionStore = {
  load: (
    sessionId: SessionId,
    context?: AdapterCallContext,
  ) => MaybePromise<InteractionState | null>;
  save: (
    sessionId: SessionId,
    state: InteractionState,
    context?: AdapterCallContext,
  ) => MaybePromise<boolean | null>;
  delete?: (sessionId: SessionId, context?: AdapterCallContext) => MaybePromise<boolean | null>;
};

export type SessionPolicy = {
  merge?: (
    previous: InteractionState | null,
    next: InteractionState,
  ) => MaybePromise<InteractionState>;
  summarize?: (state: InteractionState) => MaybePromise<InteractionState>;
  truncate?: (state: InteractionState) => MaybePromise<InteractionState>;
};

export type InteractionSession = {
  getState: () => InteractionState;
  send: (message: Message) => MaybePromise<InteractionRunOutcome>;
  save?: () => MaybePromise<boolean | null>;
};
export type InteractionHelperEventStream = EventStream;
