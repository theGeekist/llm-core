// #region docs
import { createAiChat } from "@nlux/core";
import { createNluxChatAdapter, fromAiSdkModel, type NluxChatAdapterOptions } from "#adapters";
import { createInteractionHandle } from "#interaction";
import { openai } from "@ai-sdk/openai";

const handle = createInteractionHandle().defaults({
  adapters: { model: fromAiSdkModel(openai("gpt-4o-mini")) },
});

const adapterOptions: NluxChatAdapterOptions = { handle };
const adapter = createNluxChatAdapter(adapterOptions);

const chat = createAiChat().withAdapter(adapter);

void chat;
// #endregion docs
