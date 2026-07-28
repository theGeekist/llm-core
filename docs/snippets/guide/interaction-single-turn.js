// #region setup
import { createInteractionHandle } from "#interaction";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

const model = fromAiSdkModel(openai("gpt-4o-mini"));
const interaction = createInteractionHandle({ adapters: { model } });
// #endregion setup

// #region run
const result = await interaction.run({ message: { role: "user", content: "Hello!" } });
// #endregion run

// #region read
const assistant = result.state.messages.find(isAssistantMessage);
console.log(assistant?.content);
// #endregion read

void interaction;

/** @param {{ role: string }} message */
function isAssistantMessage(message) {
  return message.role === "assistant";
}
