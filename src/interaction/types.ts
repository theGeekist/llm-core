import type {
  EventStream,
  EventStreamEvent,
  ModelStreamEvent,
  QueryStreamEvent,
} from "../adapters/types";
import type { Message } from "../adapters/types/messages";
import type { PipelineDiagnostic, PipelinePaused, PipelineRunState } from "@wpkernel/pipeline/core";
import type { DiagnosticEntry } from "../shared/diagnostics";
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

export type InteractionRunResult = PipelineRunState<InteractionState, PipelineDiagnostic> & {
  context: InteractionContext;
  state: Record<string, unknown>;
};

export type InteractionRunOutcome = InteractionRunResult | PipelinePaused<Record<string, unknown>>;

export type InteractionContext = ExecutionContextBase & {
  reducer: InteractionReducer;
  eventStream?: EventStream;
};
