// #region docs
import { createAiSdkChatTransport, fromAiSdkModel } from "#adapters";
import { createInteractionHandle } from "#interaction";
import { openai } from "@ai-sdk/openai";

const handle = createInteractionHandle().defaults({
  adapters: { model: fromAiSdkModel(openai("gpt-4o-mini")) },
});

const transport = createAiSdkChatTransport({ handle });

// useChat({ transport })
void transport;
// #endregion docs
