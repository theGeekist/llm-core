import type {
  EventStream,
  EventStreamEvent,
  ModelStreamEvent,
  QueryStreamEvent,
} from "../adapters/types";
import type { AdapterCallContext } from "../adapters/types";
import type { Message } from "../adapters/types/messages";
import type { PipelineDiagnostic, PipelinePaused, PipelineStep } from "@wpkernel/pipeline/core";
import type { DiagnosticEntry } from "../shared/diagnostics";
import type { MaybePromise } from "../shared/maybe";
import type { TraceEvent } from "../shared/trace";
import type {
  ExecutionContextBase,
  PauseRequest,
  RunOptionsBase,
  TraceDiagnostics,
} from "../shared/types";

export type InteractionEventMeta = {
  sequence: number;
  timestamp: number;
  sourceId: string;
  correlationId?: string;
  interactionId?: string;
};

export type InteractionEvent =
  | { kind: "trace"; event: TraceEvent; meta: InteractionEventMeta }
  | { kind: "diagnostic"; entry: DiagnosticEntry; meta: InteractionEventMeta }
  | { kind: "model"; event: ModelStreamEvent; meta: InteractionEventMeta }
  | { kind: "query"; event: QueryStreamEvent; meta: InteractionEventMeta }
  | { kind: "event-stream"; event: EventStreamEvent; meta: InteractionEventMeta };

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
