// #region store
import { createBuiltinModel } from "#adapters";
import { createInteractionSession } from "#interaction";
import type { EventStream, EventStreamEvent } from "#adapters";
import type { InteractionState, SessionId, SessionStore } from "#interaction";

const sessionState = new Map<string, InteractionState>();
const emitted: EventStreamEvent[] = [];

const store: SessionStore = {
  load: loadSessionState,
  save: saveSessionState,
};

const eventStream: EventStream = {
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

if ("__paused" in outcome && outcome.__paused) {
  throw new Error("Interaction paused.");
}

const state = session.getState();
console.log(state.messages.length);
// #endregion turn

function readSessionKey(id: SessionId) {
  return typeof id === "string" ? id : id.sessionId;
}

function loadSessionState(id: SessionId) {
  return sessionState.get(readSessionKey(id)) ?? null;
}

function saveSessionState(id: SessionId, state: InteractionState) {
  sessionState.set(readSessionKey(id), state);
  return true;
}

function emitEvent(event: EventStreamEvent) {
  emitted.push(event);
  return true;
}

void emitted;
