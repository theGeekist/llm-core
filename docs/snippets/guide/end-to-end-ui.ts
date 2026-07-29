// #region setup
import { createAssistantUiInteractionEventStream, createBuiltinModel } from "#adapters";
import { createInteractionSession } from "#interaction";
import type { SessionId, SessionStore, InteractionState } from "#interaction";
import type { AssistantTransportCommand } from "@assistant-ui/react";

const sessionState = new Map<string, InteractionState>();

const store: SessionStore = {
  load: loadSessionState,
  save: saveSessionState,
};
// #endregion setup

// #region handler
export type ChatTurnInput = {
  sessionId: SessionId;
  message: string;
  sendCommand: (command: AssistantTransportCommand) => void;
};

export function handleChatTurn(input: ChatTurnInput) {
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

function readSessionKey(id: SessionId) {
  return typeof id === "string" ? id : id.sessionId;
}

function loadSessionState({ sessionId }: { sessionId: SessionId }) {
  return sessionState.get(readSessionKey(sessionId)) ?? null;
}

function saveSessionState({ sessionId, state }: { sessionId: SessionId; state: InteractionState }) {
  sessionState.set(readSessionKey(sessionId), state);
  return true;
}
