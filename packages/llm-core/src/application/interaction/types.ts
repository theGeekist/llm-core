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
  RedactionMetadata,
  ToolReceiptState,
} from "../../features/evidence/public";
import type {
  LiveContinuation,
  ProviderSessionRef,
  Snapshot,
} from "../../features/state/public";

export interface InteractionContentEventFactsByKind {
  readonly "interaction.message.started": {
    readonly messageId: string;
  };
  readonly "interaction.message.text.delta": {
    readonly messageId: string;
    readonly text: string;
  };
  readonly "interaction.message.reasoning.delta": {
    readonly messageId: string;
    readonly text: string;
  };
  readonly "interaction.message.tool.call": {
    readonly messageId: string;
    readonly toolCallId: string;
    readonly toolName: string;
    readonly projectedInput: JsonValue;
  };
  readonly "interaction.message.tool.result": {
    readonly messageId: string;
    readonly toolCallId: string;
    readonly toolName: string;
    readonly projectedResult: JsonValue;
    readonly isError: boolean;
  };
  readonly "interaction.message.completed": {
    readonly messageId: string;
  };
  readonly "interaction.message.failed": {
    readonly messageId: string;
    readonly reasonCode: string;
  };
}

export type InteractionContentEventKind = keyof InteractionContentEventFactsByKind;

interface InteractionContentEventBase {
  readonly eventId: EventId;
  readonly occurredAt: string;
  readonly sequence: number;
  readonly runId: RunId;
  readonly redaction: RedactionMetadata;
}

export type InteractionContentEvent = {
  readonly [TKind in InteractionContentEventKind]: InteractionContentEventBase & {
    readonly kind: TKind;
    readonly facts: Readonly<InteractionContentEventFactsByKind[TKind]>;
  };
}[InteractionContentEventKind];

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
    }
  | {
      readonly kind: "content";
      readonly conversationId: ConversationId;
      readonly event: InteractionContentEvent;
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
    }
  | {
      readonly kind: "message-started";
      readonly eventId: EventId;
      readonly runId: RunId;
      readonly messageId: string;
    }
  | {
      readonly kind: "text-delta" | "reasoning-delta";
      readonly eventId: EventId;
      readonly runId: RunId;
      readonly messageId: string;
      readonly text: string;
    }
  | {
      readonly kind: "tool-call";
      readonly eventId: EventId;
      readonly runId: RunId;
      readonly messageId: string;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly projectedInput: JsonValue;
    }
  | {
      readonly kind: "tool-result";
      readonly eventId: EventId;
      readonly runId: RunId;
      readonly messageId: string;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly projectedResult: JsonValue;
      readonly isError: boolean;
    }
  | {
      readonly kind: "message-finished";
      readonly eventId: EventId;
      readonly runId: RunId;
      readonly messageId: string;
    }
  | {
      readonly kind: "message-failed";
      readonly eventId: EventId;
      readonly runId: RunId;
      readonly messageId: string;
      readonly reasonCode: string;
    };

export interface InteractionProjection {
  readonly conversationId: ConversationId;
  readonly status: InteractionRunStatus;
  readonly runId?: RunId;
  readonly eventIds: readonly EventId[];
  readonly events: readonly InteractionUiEvent[];
  readonly lastSequences: Readonly<Record<string, number>>;
  readonly terminalRunIds: readonly RunId[];
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
  readonly reservationId: string;
  readonly snapshot: ConversationSessionSnapshot;
}

export interface ConversationSessionReservationRequest {
  readonly conversationId: ConversationId;
  readonly expectedRevision: number;
  readonly reservationId: string;
}

export interface ConversationSessionReservation {
  readonly conversationId: ConversationId;
  readonly expectedRevision: number;
  readonly reservationId: string;
}

export interface ConversationSessionStore {
  load(
    request: ConversationSessionLoadRequest,
  ): MaybePromise<ConversationSessionSnapshot | null>;
  /**
   * Atomically acquires exclusive ownership of `expectedRevision`.
   *
   * At most one reservation may be returned for a conversation revision. The
   * reservation remains exclusive until `save` consumes it or `release` is
   * called; implementations must not emulate this with a post-execution CAS.
   */
  reserve(
    request: ConversationSessionReservationRequest,
  ): MaybePromise<ConversationSessionReservation | null>;
  /**
   * Commits the next snapshot only for the still-held reservation.
   *
   * `conflict` means the reservation was lost or invalid and is never a normal
   * optimistic race after runner execution.
   */
  save(request: ConversationSessionSaveRequest): MaybePromise<"saved" | "conflict">;
  /** Idempotently releases an uncommitted or consumed reservation. */
  release(reservation: ConversationSessionReservation): MaybePromise<void>;
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
  emitContent(event: InteractionContentEvent): Promise<void>;
  load(): Promise<ConversationSessionSnapshot>;
  send(request: InteractionSendRequest): Promise<InteractionRun>;
  reconnect(
    continuation: LiveContinuation<InteractionLiveConnection>,
  ): InteractionLiveConnection;
}

export interface InteractionSessionIdentityPort {
  now(): string;
  newSnapshotId(): string;
  newReservationId(): string;
}

export interface CreateInteractionSessionOptions {
  readonly conversationId: ConversationId;
  readonly agent: PreparedAgentSpec;
  readonly runner: AgentRunner;
  readonly store: ConversationSessionStore;
  readonly identity: InteractionSessionIdentityPort;
}
