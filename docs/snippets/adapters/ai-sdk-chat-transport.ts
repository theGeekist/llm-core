// #region docs
import {
  createAiSdkChatTransport,
  fromAiSdkModel,
  type AiSdkChatTransportOptions,
} from "#adapters";
import { createInteractionHandle } from "#interaction";
import { openai } from "@ai-sdk/openai";

const handle = createInteractionHandle().defaults({
  adapters: { model: fromAiSdkModel(openai("gpt-4o-mini")) },
});

const transportOptions: AiSdkChatTransportOptions = { handle };
const transport = createAiSdkChatTransport(transportOptions);

// useChat({ transport })
void transport;
// #endregion docs
