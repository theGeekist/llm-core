import type {
  AdapterBundle,
  EventStream,
  EventStreamEvent,
  ModelStreamEvent,
  PauseKind,
  QueryStreamEvent,
} from "../adapters/types";
import type { Message } from "../adapters/types/messages";
import type {
  PipelineDiagnostic,
  PipelinePaused,
  PipelineReporter,
  PipelineRunState,
} from "@wpkernel/pipeline/core";
import type { DiagnosticEntry } from "../workflow/diagnostics";
import type { TraceEvent } from "../workflow/trace";

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

export type InteractionState = {
  messages: Message[];
  diagnostics: DiagnosticEntry[];
  trace: TraceEvent[];
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

export type InteractionRunOptions = {
  input: InteractionInput;
  adapters?: AdapterBundle;
  reducer?: InteractionReducer;
  eventStream?: EventStream;
  reporter?: PipelineReporter;
};

export type InteractionPauseRequest = {
  token?: unknown;
  pauseKind?: PauseKind;
  payload?: unknown;
};

export type InteractionRunResult = PipelineRunState<InteractionState, PipelineDiagnostic> & {
  context: InteractionContext;
  state: Record<string, unknown>;
};

export type InteractionRunOutcome = InteractionRunResult | PipelinePaused<Record<string, unknown>>;

export type InteractionContext = {
  reporter: PipelineReporter;
  adapters?: AdapterBundle;
  reducer: InteractionReducer;
  eventStream?: EventStream;
};
