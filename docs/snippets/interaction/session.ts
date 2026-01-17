// #region docs
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";
import { createInteractionSession } from "#interaction";
import type { InteractionState, SessionId, SessionStore } from "#interaction";

const sessionCache = new Map<string, InteractionState>();

const toSessionKey = (sessionId: SessionId) => {
  if (typeof sessionId === "string") {
    return sessionId;
  }
  return sessionId.userId ? `${sessionId.sessionId}:${sessionId.userId}` : sessionId.sessionId;
};

const store: SessionStore = {
  load: (sessionId) => sessionCache.get(toSessionKey(sessionId)) ?? null,
  save: (sessionId, state) => {
    sessionCache.set(toSessionKey(sessionId), state);
    return true;
  },
};

const model = fromAiSdkModel(openai("gpt-4o-mini"));

const session = createInteractionSession({
  sessionId: { sessionId: "thread-1", userId: "user-1" },
  store,
  adapters: { model },
});

const result = await session.send({ role: "user", content: "Hello!" });

if ("__paused" in result && result.__paused) {
  throw new Error("Interaction paused.");
}

console.log(session.getState().messages);
// #endregion docs
