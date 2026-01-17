// #region docs
import { runInteractionRequest } from "#interaction";
import { createBuiltinModel, createAssistantUiInteractionEventStream } from "#adapters";

// Example mock objects
const model = createBuiltinModel();
const eventStream = createAssistantUiInteractionEventStream({ sendCommand: () => {} });
/** @type {{ role: "user", content: string }[]} */
const messages = [{ role: "user", content: "Hello" }];

await runInteractionRequest({
  recipeId: "agent",
  interactionId: "chat-123",
  model,
  messages,
  eventStream,
});
// #endregion docs
