import type {
  ConversationId,
  EventId,
  InvocationContext,
  JsonValue,
  RunId,
} from "#contracts";
import type { MaybePromise } from "#shared/maybe";
import type {
  AgentRun,
  AgentRunEvent,
  AgentRunner,
  PreparedAgentSpec,
  RunResult,
} from "../../features/agent/public";
import type {
  EventSink,
  ExecutionEvent,
  ToolReceiptState,
} from "../../features/evidence/public";
import type {
  LiveContinuation,
  ProviderSessionRef,
  Snapshot,
} from "../../features/state/public";

export type InteractionEvent =
  | {
      readonly kind: "agent-run";
      readonly conversationId: ConversationId;
      readonly event: AgentRunEvent;
    }
  | {
      readonly kind: "tool-execution";
      readonly conversationId: ConversationId;
      readonly event: ExecutionEvent;
    };

export type InteractionRunStatus =
  | "idle"
  | "running"
  | "awaiting-intervention"
  | "cancellation-requested"
  | RunResult["status"];

export type InteractionUiEvent =
  | {
      readonly kind: "run-started";
      readonly eventId: EventId;
      readonly runId: RunId;
      readonly agentId: string;
    }
  | {
      readonly kind: "run-progress";
      readonly eventId: EventId;
      readonly runId: RunId;
      readonly code: string;
    }
  | {
      readonly kind: "intervention-requested";
      readonly eventId: EventId;
      readonly runId: RunId;
      readonly interventionId: string;
      readonly allowed: readonly string[];
      readonly expiresAt: string;
    }
  | {
      readonly kind: "cancellation-requested";
      readonly eventId: EventId;
      readonly runId: RunId;
    }
  | {
      readonly kind: "tool-status";
      readonly eventId: EventId;
      readonly runId: RunId;
      readonly toolCallId: string;
      readonly receiptState: ToolReceiptState;
      readonly reasonCode?: string;
    }
  | {
      readonly kind: "run-finished";
      readonly eventId: EventId;
      readonly runId: RunId;
      readonly status: RunResult["status"];
      readonly reasonCode?: string;
    };

export interface InteractionProjection {
  readonly conversationId: ConversationId;
  readonly status: InteractionRunStatus;
  readonly runId?: RunId;
  readonly eventIds: readonly EventId[];
  readonly events: readonly InteractionUiEvent[];
}

export interface ConversationTurn {
  readonly runId: RunId;
  readonly input: JsonValue;
  readonly status: RunResult["status"];
  readonly output?: JsonValue;
  readonly reasonCode?: string;
}

export interface ConversationSessionValue {
  readonly conversationId: ConversationId;
  readonly revision: number;
  readonly turns: readonly ConversationTurn[];
  readonly projection: InteractionProjection;
  readonly providerSession?: ProviderSessionRef;
}

export type ConversationSessionSnapshot = Omit<Snapshot, "value"> & {
  readonly value: ConversationSessionValue;
};

export interface ConversationSessionLoadRequest {
  readonly conversationId: ConversationId;
}

export interface ConversationSessionSaveRequest {
  readonly conversationId: ConversationId;
  readonly expectedRevision: number;
  readonly snapshot: ConversationSessionSnapshot;
}

export interface ConversationSessionStore {
  load(
    request: ConversationSessionLoadRequest,
  ): MaybePromise<ConversationSessionSnapshot | null>;
  save(request: ConversationSessionSaveRequest): MaybePromise<"saved" | "conflict">;
}

export interface InteractionSendRequest {
  readonly input: JsonValue;
  readonly invocationContext: InvocationContext;
}

export interface InteractionRunResult {
  readonly conversationId: ConversationId;
  readonly run: RunResult;
  readonly snapshot: ConversationSessionSnapshot;
}

export interface InteractionLiveConnection {
  readonly conversationId: ConversationId;
  readonly runId: RunId;
  events(): AsyncIterable<InteractionEvent>;
  result(): Promise<InteractionRunResult>;
}

export interface InteractionRun extends InteractionLiveConnection {
  readonly continuation: LiveContinuation<InteractionLiveConnection>;
  readonly agentRun: AgentRun;
}

export interface InteractionSession {
  readonly conversationId: ConversationId;
  readonly executionEventSink: EventSink;
  load(): Promise<ConversationSessionSnapshot>;
  send(request: InteractionSendRequest): Promise<InteractionRun>;
  reconnect(
    continuation: LiveContinuation<InteractionLiveConnection>,
  ): InteractionLiveConnection;
}

export interface InteractionSessionIdentityPort {
  now(): string;
  newSnapshotId(): string;
}

export interface CreateInteractionSessionOptions {
  readonly conversationId: ConversationId;
  readonly agent: PreparedAgentSpec;
  readonly runner: AgentRunner;
  readonly store: ConversationSessionStore;
  readonly identity: InteractionSessionIdentityPort;
}
