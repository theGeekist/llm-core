// #region store
import { createBuiltinModel } from "#adapters";
import { createInteractionSession } from "#interaction";

const sessionState = new Map();
/** @type {import("#adapters").EventStreamEvent[]} */
const emitted = [];

/** @type {import("#interaction").SessionStore} */
const store = {
  load: loadSessionState,
  save: saveSessionState,
};

/** @type {import("#adapters").EventStream} */
const eventStream = {
  emit: emitEvent,
};
// #endregion store

// #region session
const session = createInteractionSession({
  sessionId: "demo",
  store,
  adapters: { model: createBuiltinModel() },
  eventStream,
});
// #endregion session

// #region turn
const outcome = await session.send({ role: "user", content: "Hello!" });

if (isPausedOutcome(outcome)) {
  throw new Error("Interaction paused.");
}

const state = session.getState();
console.log(state.messages.length);
// #endregion turn

/**
 * @param {import("#interaction").SessionId} id
 */
function readSessionKey(id) {
  return typeof id === "string" ? id : id.sessionId;
}

/**
 * @param {import("#interaction").SessionId} id
 */
function loadSessionState(id) {
  return sessionState.get(readSessionKey(id)) ?? null;
}

/**
 * @param {import("#interaction").SessionId} id
 * @param {import("#interaction").InteractionState} state
 */
function saveSessionState(id, state) {
  sessionState.set(readSessionKey(id), state);
  return true;
}

/**
 * @param {import("#adapters").EventStreamEvent} event
 */
function emitEvent(event) {
  emitted.push(event);
  return true;
}

/**
 * @param {import("#interaction").InteractionRunOutcome} outcome
 * @returns {outcome is import("#interaction").PipelinePaused<Record<string, unknown>>}
 */
function isPausedOutcome(outcome) {
  return (
    !!outcome && typeof outcome === "object" && "__paused" in outcome && outcome.__paused === true
  );
}

void emitted;
