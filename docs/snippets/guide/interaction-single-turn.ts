// #region setup
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";
import { createInteractionHandle } from "#interaction";
// #endregion setup

// #region run
const model = fromAiSdkModel(openai("gpt-4o-mini"));
const interaction = createInteractionHandle({ adapters: { model } });
const result = await interaction.run({ message: { role: "user", content: "Hello!" } });
// #endregion run

// #region read
const assistant = result.state.messages.find(isAssistantMessage);
console.log(assistant?.content);
// #endregion read

void interaction;

function isAssistantMessage(message: { role: string }) {
  return message.role === "assistant";
}
