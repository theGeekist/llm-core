// #region setup
import { createAssistantUiInteractionEventStream, createBuiltinModel } from "#adapters";
import { createInteractionSession } from "#interaction";

const sessionState = new Map();

/** @type {import("#interaction").SessionStore} */
const store = {
  load: loadSessionState,
  save: saveSessionState,
};
// #endregion setup

// #region handler
/**
 * @typedef ChatTurnInput
 * @property {import("#interaction").SessionId} sessionId
 * @property {string} message
 * @property {(command: import("@assistant-ui/react").AssistantTransportCommand) => void} sendCommand
 */

/**
 * @param {ChatTurnInput} input
 */
export function handleChatTurn(input) {
  const eventStream = createAssistantUiInteractionEventStream({
    sendCommand: input.sendCommand,
  });

  const session = createInteractionSession({
    sessionId: input.sessionId,
    store,
    adapters: { model: createBuiltinModel() },
    eventStream,
  });

  return session.send({ role: "user", content: input.message });
}
// #endregion handler

/**
 * @param {import("#interaction").SessionId} id
 */
function readSessionKey(id) {
  return typeof id === "string" ? id : id.sessionId;
}

/**
 * @param {import("#interaction").SessionStoreRequest} request
 */
function loadSessionState({ sessionId }) {
  return sessionState.get(readSessionKey(sessionId)) ?? null;
}

/**
 * @param {import("#interaction").SessionStoreSaveRequest} request
 */
function saveSessionState({ sessionId, state }) {
  sessionState.set(readSessionKey(sessionId), state);
  return true;
}
