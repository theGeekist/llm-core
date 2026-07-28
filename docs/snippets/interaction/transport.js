// #region docs
import { createInteractionHandle } from "#interaction";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

const eventStream = {
  emit(event) {
    console.log(event.name);
    return true;
  },
};

const interaction = createInteractionHandle({
  adapters: { model: fromAiSdkModel(openai("gpt-4o-mini")) },
  eventStream,
});
await interaction.run({ message: { role: "user", content: "Hello!" } });
// #endregion docs
