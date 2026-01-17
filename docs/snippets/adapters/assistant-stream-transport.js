// #region docs
import { createAssistantUiInteractionStream, createBuiltinModel } from "#adapters";
import { AssistantStream, DataStreamEncoder } from "assistant-stream";
import { runInteractionRequest } from "#interaction";

export async function POST() {
  // 1. Create the stream adapter
  const { stream, eventStream } = createAssistantUiInteractionStream();

  // 2. Run your interaction (passing the eventStream)
  await runInteractionRequest({
    recipeId: "agent",
    model: createBuiltinModel(),
    messages: [{ role: "user", content: "Hello from the assistant stream!" }],
    interactionId: "chat-123",
    eventStream,
  });

  // 3. Return the response
  return AssistantStream.toResponse(stream, new DataStreamEncoder());
}
// #endregion docs
