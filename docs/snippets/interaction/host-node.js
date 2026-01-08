// #region docs
import { createInteractionSession } from "#interaction";
import { createBuiltinModel } from "#adapters";

/**
 * @typedef {object} NodeResponse
 * @property {(chunk: string) => void} write
 * @property {(name: string, value: string) => void} [setHeader]
 * @property {() => void} [end]
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

class NodeSseEventStream {
  /**
   * @param {{ response: NodeResponse }} options
   */
  constructor(options) {
    this.response = options.response;
  }

  /**
   * @param {import("#adapters").EventStreamEvent} event
   */
  emit(event) {
    return writeSseEvent({ response: this.response, event });
  }

  /**
   * @param {import("#adapters").EventStreamEvent[]} events
   */
  emitMany(events) {
    return writeSseEvents({ response: this.response, events });
  }
}

/**
 * @param {{ response: NodeResponse }} options
 */
export const createNodeSseEventStream = (options) => new NodeSseEventStream(options);

const store = new MemorySessionStore();

/**
 * @param {{ response: NodeResponse; sessionId: import("#interaction").SessionId; message: string }} input
 */
export const handleChatRequest = (input) => {
  const eventStream = createNodeSseEventStream({ response: input.response });
  const session = createInteractionSession({
    sessionId: input.sessionId,
    store,
    adapters: { model: createBuiltinModel() },
    eventStream,
  });
  return session.send({ role: "user", content: input.message });
};

/**
 * @param {import("#interaction").SessionId} sessionId
 */
const toSessionKey = (sessionId) =>
  typeof sessionId === "string" ? sessionId : sessionId.sessionId;

/**
 * @param {{ response: NodeResponse }} input
 */
const initSseHeaders = (input) => {
  if (input.response.setHeader) {
    input.response.setHeader("content-type", "text/event-stream");
    input.response.setHeader("cache-control", "no-cache");
    input.response.setHeader("connection", "keep-alive");
  }
};

/**
 * @param {{ response: NodeResponse; event: import("#adapters").EventStreamEvent }} input
 */
const writeSseEvent = (input) => {
  initSseHeaders({ response: input.response });
  try {
    input.response.write(formatSseEvent(input.event));
    return true;
  } catch {
    return false;
  }
};

/**
 * @param {{ response: NodeResponse; events: import("#adapters").EventStreamEvent[] }} input
 */
const writeSseEvents = (input) => {
  initSseHeaders({ response: input.response });
  try {
    for (const event of input.events) {
      input.response.write(formatSseEvent(event));
    }
    return true;
  } catch {
    return false;
  }
};

/**
 * @param {import("#adapters").EventStreamEvent} event
 */
const formatSseEvent = (event) => `event: ${event.name}\ndata: ${JSON.stringify(event.data)}\n\n`;
// #endregion docs
