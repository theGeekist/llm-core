import type { AdapterBundle, EventStream, Message, AdapterCallContext } from "#adapters/types";
import type { PipelineReporter } from "@wpkernel/pipeline/core";
import type {
  InteractionReducer,
  InteractionRunOptions,
  InteractionRunOutcome,
  InteractionState,
  InteractionSession,
  SessionId,
  SessionPolicy,
  SessionStore,
} from "./types";
import { createInteractionPipelineWithDefaults, runInteractionPipeline } from "./steps";
import { bindFirst } from "#shared/fp";
import { maybeChain, maybeMap, maybeTap, type MaybePromise } from "#shared/maybe";
import { createEmptyState, isPausedOutcome, readOutcomeState } from "./handle";

export type InteractionSessionOptions = {
  sessionId: SessionId;
  store: SessionStore;
  adapters?: AdapterBundle;
  reducer?: InteractionReducer;
  eventStream?: EventStream;
  reporter?: PipelineReporter;
  policy?: SessionPolicy;
  context?: AdapterCallContext;
};

type InteractionSessionRuntime = {
  sessionId: SessionId;
  store: SessionStore;
  adapters?: AdapterBundle;
  reducer?: InteractionReducer;
  eventStream?: EventStream;
  reporter?: PipelineReporter;
  policy?: SessionPolicy;
  context?: AdapterCallContext;
  pipeline: unknown;
  state: InteractionState;
};

type SessionLoadInput = {
  store: SessionStore;
  sessionId: SessionId;
  context?: AdapterCallContext;
};

type SessionSaveInput = {
  store: SessionStore;
  sessionId: SessionId;
  state: InteractionState;
  context?: AdapterCallContext;
};

type SessionPolicyInput = {
  policy?: SessionPolicy;
  previous: InteractionState | null;
  next: InteractionState;
};

type SessionOutcomeBase = {
  runtime: InteractionSessionRuntime;
  previous: InteractionState;
};

type SessionOutcomeInput = SessionOutcomeBase & {
  outcome: InteractionRunOutcome;
};

const createSessionRuntime = (options: InteractionSessionOptions): InteractionSessionRuntime => ({
  sessionId: options.sessionId,
  store: options.store,
  adapters: options.adapters,
  reducer: options.reducer,
  eventStream: options.eventStream,
  reporter: options.reporter,
  policy: options.policy,
  context: options.context,
  pipeline: createInteractionPipelineWithDefaults(),
  state: createEmptyState(),
});

const toSessionLoadInput = (runtime: InteractionSessionRuntime): SessionLoadInput => ({
  store: runtime.store,
  sessionId: runtime.sessionId,
  context: runtime.context,
});

const toSessionSaveInput = (
  runtime: InteractionSessionRuntime,
  state: InteractionState,
): SessionSaveInput => ({
  store: runtime.store,
  sessionId: runtime.sessionId,
  context: runtime.context,
  state,
});

const loadSessionState = (input: SessionLoadInput) =>
  input.store.load(input.sessionId, input.context);

const saveSessionState = (input: SessionSaveInput) =>
  input.store.save(input.sessionId, input.state, input.context);

const readSessionState = (runtime: InteractionSessionRuntime) => runtime.state;

const hydrateSessionState = (
  runtime: InteractionSessionRuntime,
  loaded: InteractionState | null,
) => {
  const next = loaded ?? runtime.state;
  runtime.state = next;
  return next;
};

const readPreviousSessionState = (runtime: InteractionSessionRuntime) =>
  maybeMap(bindFirst(hydrateSessionState, runtime), loadSessionState(toSessionLoadInput(runtime)));

const createSessionOutcomeBase = (
  runtime: InteractionSessionRuntime,
  previous: InteractionState,
): SessionOutcomeBase => ({
  runtime,
  previous,
});

const attachSessionOutcome = (
  base: SessionOutcomeBase,
  outcome: InteractionRunOutcome,
): SessionOutcomeInput => ({
  runtime: base.runtime,
  previous: base.previous,
  outcome,
});

const toRunOptions = (
  runtime: InteractionSessionRuntime,
  message: Message,
  state: InteractionState,
): InteractionRunOptions => ({
  input: { message, state },
  adapters: runtime.adapters,
  reducer: runtime.reducer,
  eventStream: runtime.eventStream,
  reporter: runtime.reporter,
});

const runSessionWithState = (
  runtime: InteractionSessionRuntime,
  message: Message,
  previous: InteractionState,
) => runInteractionPipeline(runtime.pipeline, toRunOptions(runtime, message, previous));

const runSessionCaptureOutcome = (
  runtime: InteractionSessionRuntime,
  message: Message,
  previous: InteractionState,
) =>
  maybeMap(
    bindFirst(attachSessionOutcome, createSessionOutcomeBase(runtime, previous)),
    runSessionWithState(runtime, message, previous),
  );

const bindSessionCaptureOutcome = (runtime: InteractionSessionRuntime, message: Message) =>
  bindFirst(bindFirst(runSessionCaptureOutcome, runtime), message);

const applyMergePolicy = (input: SessionPolicyInput): MaybePromise<InteractionState> => {
  const merge = input.policy?.merge;
  if (!merge) {
    return input.next;
  }
  return merge(input.previous, input.next);
};

const applySummarizePolicy = (policy: SessionPolicy | undefined, state: InteractionState) => {
  const summarize = policy?.summarize;
  if (!summarize) {
    return state;
  }
  return summarize(state);
};

const applyTruncatePolicy = (policy: SessionPolicy | undefined, state: InteractionState) => {
  const truncate = policy?.truncate;
  if (!truncate) {
    return state;
  }
  return truncate(state);
};

const applySessionPolicy = (input: SessionPolicyInput): MaybePromise<InteractionState> => {
  const merged = applyMergePolicy(input);
  const summarized = maybeChain(bindFirst(applySummarizePolicy, input.policy), merged);
  return maybeChain(bindFirst(applyTruncatePolicy, input.policy), summarized);
};

const toSessionPolicyInput = (input: SessionOutcomeInput): SessionPolicyInput => ({
  policy: input.runtime.policy,
  previous: input.previous,
  next: readOutcomeState(input.outcome),
});

const updateSessionState = (runtime: InteractionSessionRuntime, state: InteractionState) => {
  runtime.state = state;
  return state;
};

const saveSessionStateFromRuntime = (runtime: InteractionSessionRuntime, state: InteractionState) =>
  saveSessionState(toSessionSaveInput(runtime, state));

const persistSessionState = (runtime: InteractionSessionRuntime, state: InteractionState) =>
  maybeTap(bindFirst(saveSessionStateFromRuntime, runtime), updateSessionState(runtime, state));

const updateOutcomeArtefact = (
  outcome: InteractionRunOutcome,
  state: InteractionState,
): InteractionRunOutcome => {
  if (isPausedOutcome(outcome)) {
    return outcome;
  }
  return { ...outcome, artefact: state };
};

const applyPolicyToOutcome = (input: SessionOutcomeInput) => {
  if (isPausedOutcome(input.outcome)) {
    const pausedState = readOutcomeState(input.outcome);
    updateSessionState(input.runtime, pausedState);
    return input.outcome;
  }
  const policyState = applySessionPolicy(toSessionPolicyInput(input));
  const persisted = maybeChain(bindFirst(persistSessionState, input.runtime), policyState);
  return maybeMap(bindFirst(updateOutcomeArtefact, input.outcome), persisted);
};

const runSessionSend = (runtime: InteractionSessionRuntime, message: Message) => {
  const previous = readPreviousSessionState(runtime);
  const run = bindSessionCaptureOutcome(runtime, message);
  const outcome = maybeChain(run, previous);
  return maybeChain(applyPolicyToOutcome, outcome);
};

const runSessionSave = (runtime: InteractionSessionRuntime) =>
  saveSessionState(toSessionSaveInput(runtime, runtime.state));

export const createInteractionSession = (
  options: InteractionSessionOptions,
): InteractionSession => {
  const runtime = createSessionRuntime(options);
  return {
    getState: bindFirst(readSessionState, runtime),
    send: bindFirst(runSessionSend, runtime),
    save: bindFirst(runSessionSave, runtime),
  };
};
