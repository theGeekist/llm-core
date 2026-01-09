// #region docs
import { createAiChat } from "@nlux/core";
import { createNluxChatAdapter, fromAiSdkModel } from "#adapters";
import { createInteractionHandle } from "#interaction";
import { openai } from "@ai-sdk/openai";

const handle = createInteractionHandle().defaults({
  adapters: { model: fromAiSdkModel(openai("gpt-4o-mini")) },
});

const adapter = createNluxChatAdapter({ handle });
const chat = createAiChat().withAdapter(adapter);

void chat;
// #endregion docs
