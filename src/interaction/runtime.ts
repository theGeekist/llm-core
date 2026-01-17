import type { AdapterBundle, EventStream, Message, AdapterCallContext } from "#adapters/types";
import type { PipelineReporter } from "@wpkernel/pipeline/core";
import type {
  InteractionReducer,
  InteractionRunOutcome,
  InteractionState,
  SessionId,
  SessionPolicy,
  SessionStore,
} from "./types";
import { createInteractionSession } from "./session";
import { bindFirst } from "#shared/fp";
import type { MaybePromise } from "#shared/maybe";

export type InteractionSessionRuntimeOptions = {
  store: SessionStore;
  createSessionId: () => MaybePromise<SessionId>;
  adapters?: AdapterBundle;
  reducer?: InteractionReducer;
  eventStream?: EventStream;
  reporter?: PipelineReporter;
  policy?: SessionPolicy;
  context?: AdapterCallContext;
};

export type InteractionSessionStreamInput = {
  sessionId: SessionId;
  message: Message;
  adapters?: AdapterBundle;
  reducer?: InteractionReducer;
  eventStream?: EventStream;
  reporter?: PipelineReporter;
  policy?: SessionPolicy;
  context?: AdapterCallContext;
};

export type InteractionSessionRuntime = {
  create: () => MaybePromise<SessionId>;
  load: (sessionId: SessionId) => MaybePromise<InteractionState | null>;
  stream: (input: InteractionSessionStreamInput) => MaybePromise<InteractionRunOutcome>;
};

const loadSessionState = (runtime: InteractionSessionRuntimeOptions, sessionId: SessionId) =>
  runtime.store.load(sessionId, runtime.context);

const runSessionStream = (
  runtime: InteractionSessionRuntimeOptions,
  input: InteractionSessionStreamInput,
) => {
  const session = createInteractionSession({
    sessionId: input.sessionId,
    store: runtime.store,
    adapters: input.adapters ?? runtime.adapters,
    reducer: input.reducer ?? runtime.reducer,
    eventStream: input.eventStream ?? runtime.eventStream,
    reporter: input.reporter ?? runtime.reporter,
    policy: input.policy ?? runtime.policy,
    context: input.context ?? runtime.context,
  });
  return session.send(input.message);
};

export const createInteractionSessionRuntime = (
  options: InteractionSessionRuntimeOptions,
): InteractionSessionRuntime => {
  const runtime: InteractionSessionRuntimeOptions = { ...options };
  return {
    create: runtime.createSessionId,
    load: bindFirst(loadSessionState, runtime),
    stream: bindFirst(runSessionStream, runtime),
  };
};
