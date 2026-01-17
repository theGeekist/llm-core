// #region docs
import { createAiSdkWebSocketChatTransport } from "#adapters";
import { useChat } from "@ai-sdk/react";

const transport = createAiSdkWebSocketChatTransport({
  url: "ws://localhost:3001/chat",
});

const chat = useChat({
  transport,
});
// #endregion docs
void chat;
