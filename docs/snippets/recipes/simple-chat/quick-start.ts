// #region docs
import { recipes } from "#recipes";
import type { SimpleChatConfig } from "#recipes";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";
// #endregion docs

const config = {
  system: "You are a helpful coding assistant.",
  model: "gpt-4o-mini",
} satisfies SimpleChatConfig;

// #region docs
const chat = recipes["chat.simple"](config).defaults({
  adapters: {
    model: fromAiSdkModel(openai("gpt-4o-mini")),
  },
});
// #endregion docs

void chat;
