import type { AdapterBundle, AdapterCallContext, EventStream, Message } from "#adapters/types";
import { bindFirst } from "#shared/fp";
import { composeK, maybeChain, maybeMap, type MaybePromise } from "#shared/maybe";
import type { PipelineReporter } from "@wpkernel/pipeline/core";
import { createEmptyState, isPausedOutcome, readOutcomeState } from "./handle";
import {
  createInteractionPipelineWithDefaults,
  rebindInteractionResumeSnapshot,
  resumeInteractionPipeline,
  runInteractionPipeline,
} from "./steps";
import type {
  InteractionReducer,
  InteractionRunOptions,
  InteractionRunOutcome,
  InteractionRunResult,
  InteractionSession,
  InteractionSessionIdentity,
  InteractionSessionOutcome,
  InteractionSessionPauseSnapshot,
  InteractionState,
  SessionId,
  SessionPolicy,
  SessionStore,
} from "./types";

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

type SessionRuntime = InteractionSessionOptions & {
  pipeline: unknown;
  policyProgram: (state: InteractionState) => MaybePromise<InteractionState>;
  state: InteractionState;
};

type LoadedSessionState = {
  previous: InteractionState | null;
  state: InteractionState;
};

type InteractionSnapshotState = {
  userState?: InteractionState;
};

const toSessionIdentity = (sessionId: SessionId): InteractionSessionIdentity =>
  typeof sessionId === "string" ? { sessionId } : { ...sessionId };

const isSameSession = (left: InteractionSessionIdentity, right: InteractionSessionIdentity) =>
  left.sessionId === right.sessionId && left.userId === right.userId;

function assertSnapshotSession(sessionId: SessionId, snapshot: InteractionSessionPauseSnapshot) {
  if (!snapshot.interactionSession) {
    throw new Error("Interaction pause snapshot does not identify its owning session.");
  }
  if (!isSameSession(snapshot.interactionSession, toSessionIdentity(sessionId))) {
    throw new Error("Interaction pause snapshot belongs to a different session.");
  }
}

const bindSnapshotToSession = (
  sessionId: SessionId,
  outcome: InteractionRunOutcome,
): InteractionSessionOutcome => {
  if (!isPausedOutcome(outcome)) {
    return outcome;
  }
  const snapshot: InteractionSessionPauseSnapshot = {
    ...outcome.snapshot,
    interactionSession: toSessionIdentity(sessionId),
  };
  return {
    ...outcome,
    snapshot,
  };
};

function createPolicyProgram(policy?: SessionPolicy) {
  return composeK(bindFirst(applyTruncate, policy), bindFirst(applySummarize, policy));
}

const createSessionRuntime = (options: InteractionSessionOptions): SessionRuntime => ({
  ...options,
  pipeline: createInteractionPipelineWithDefaults(),
  policyProgram: createPolicyProgram(options.policy),
  state: createEmptyState(),
});

const loadSession = (runtime: SessionRuntime) =>
  runtime.store.load(runtime.sessionId, runtime.context);

const saveSession = (runtime: SessionRuntime, state: InteractionState) =>
  runtime.store.save(runtime.sessionId, state, runtime.context);

const hydrateSession = (runtime: SessionRuntime, loaded: InteractionState | null) => {
  runtime.state = loaded ?? runtime.state;
  return { previous: loaded, state: runtime.state };
};

const readPreviousState = (runtime: SessionRuntime) =>
  maybeMap(bindFirst(hydrateSession, runtime), loadSession(runtime));

const toRunOptions = (
  runtime: SessionRuntime,
  message: Message,
  state: InteractionState,
): InteractionRunOptions => ({
  input: { message, state },
  adapters: runtime.adapters,
  reducer: runtime.reducer,
  eventStream: runtime.eventStream,
  reporter: runtime.reporter,
});

const applyMerge = (
  policy: SessionPolicy | undefined,
  previous: InteractionState | null,
  next: InteractionState,
): MaybePromise<InteractionState> => policy?.merge?.(previous, next) ?? next;

const applySummarize = (policy: SessionPolicy | undefined, state: InteractionState) =>
  policy?.summarize?.(state) ?? state;

const applyTruncate = (policy: SessionPolicy | undefined, state: InteractionState) =>
  policy?.truncate?.(state) ?? state;

const applyPolicy = (
  runtime: SessionRuntime,
  previous: InteractionState | null,
  next: InteractionState,
) => maybeChain(runtime.policyProgram, applyMerge(runtime.policy, previous, next));

const updateSession = (runtime: SessionRuntime, state: InteractionState) => {
  runtime.state = state;
  return state;
};

const updatePersistedSession = (
  runtime: SessionRuntime,
  state: InteractionState,
  saved: boolean | null,
) => {
  if (saved !== true) {
    throw new Error("SessionStore.save did not commit session state.");
  }
  return updateSession(runtime, state);
};

const persistSession = (runtime: SessionRuntime, state: InteractionState) =>
  maybeMap(
    bindFirst(bindFirst(updatePersistedSession, runtime), state),
    saveSession(runtime, state),
  );

const replaceOutcomeState = (
  outcome: InteractionRunResult,
  state: InteractionState,
): InteractionRunResult => ({ ...outcome, artefact: state });

const completeSessionOutcome = (
  runtime: SessionRuntime,
  previous: InteractionState | null,
  outcome: InteractionRunOutcome,
): MaybePromise<InteractionSessionOutcome> => {
  if (isPausedOutcome(outcome)) {
    const bound = bindSnapshotToSession(runtime.sessionId, outcome);
    updateSession(runtime, readOutcomeState(bound));
    return bound;
  }
  const policyState = applyPolicy(runtime, previous, readOutcomeState(outcome));
  const persisted = maybeChain(bindFirst(persistSession, runtime), policyState);
  return maybeMap(bindFirst(replaceOutcomeState, outcome), persisted);
};

const runSession = (runtime: SessionRuntime, message: Message, loaded: LoadedSessionState) =>
  maybeChain(
    bindFirst(bindFirst(completeSessionOutcome, runtime), loaded.previous),
    runInteractionPipeline(runtime.pipeline, toRunOptions(runtime, message, loaded.state)),
  );

const sendSession = (runtime: SessionRuntime, message: Message) =>
  maybeChain(bindFirst(bindFirst(runSession, runtime), message), readPreviousState(runtime));

type SessionResumeRequest = {
  runtime: SessionRuntime;
  snapshot: InteractionSessionPauseSnapshot;
  resumeInput?: unknown;
};

const toResumeOverrides = (runtime: SessionRuntime) => ({
  adapters: runtime.adapters,
  reducer: runtime.reducer,
  eventStream: runtime.eventStream,
  reporter: runtime.reporter,
});

const resumeSessionFromState = (request: SessionResumeRequest, previous: InteractionState | null) =>
  maybeChain(
    bindFirst(bindFirst(completeSessionOutcome, request.runtime), previous),
    resumeInteractionPipeline(
      request.runtime.pipeline,
      rebindInteractionResumeSnapshot(request.snapshot, toResumeOverrides(request.runtime)),
      request.resumeInput,
    ),
  );

const readSnapshotState = (runtime: SessionRuntime, snapshot: InteractionSessionPauseSnapshot) =>
  (snapshot.state as InteractionSnapshotState).userState ?? runtime.state;

const resumeSession = (
  runtime: SessionRuntime,
  snapshot: InteractionSessionPauseSnapshot,
  resumeInput?: unknown,
) => {
  assertSnapshotSession(runtime.sessionId, snapshot);
  updateSession(runtime, readSnapshotState(runtime, snapshot));
  return maybeChain(
    bindFirst(resumeSessionFromState, { runtime, snapshot, resumeInput }),
    loadSession(runtime),
  );
};

const readSessionState = (runtime: SessionRuntime) => runtime.state;

export const createInteractionSession = (
  options: InteractionSessionOptions,
): InteractionSession => {
  const runtime = createSessionRuntime(options);
  return {
    getState: bindFirst(readSessionState, runtime),
    send: bindFirst(sendSession, runtime),
    resume: bindFirst(resumeSession, runtime),
  };
};
