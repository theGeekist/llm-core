// #region docs
import { createInteractionSession } from "#interaction";
import { createAssistantUiInteractionEventStream, createBuiltinModel } from "#adapters";

/**
 * @typedef {object} SessionInput
 * @property {import("#interaction").SessionId} sessionId
 * @property {string} message
 * @property {(command: unknown) => void} sendCommand
 */

class MemorySessionStore {
  constructor() {
    /** @type {Map<string, import("#interaction").InteractionState>} */
    this.cache = new Map();
  }

  /** @param {import("#interaction").SessionId} sessionId */
  load(sessionId) {
    const key = toSessionKey(sessionId);
    return this.cache.get(key) ?? null;
  }

  /**
   * @param {import("#interaction").SessionId} sessionId
   * @param {import("#interaction").InteractionState} state
   */
  save(sessionId, state) {
    const key = toSessionKey(sessionId);
    this.cache.set(key, state);
    return true;
  }
}

const store = new MemorySessionStore();

/**
 * @param {SessionInput} input
 */
export const handleChatTurn = (input) => {
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
};

/** @param {import("#interaction").SessionId} sessionId */
const toSessionKey = (sessionId) =>
  typeof sessionId === "string" ? sessionId : sessionId.sessionId;
// #endregion docs
