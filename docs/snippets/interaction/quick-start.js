// #region docs
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";
import { createInteractionHandle } from "#interaction";

/** @type {import("#adapters").Message} */
const message = { role: "user", content: "Hello!" };
const model = fromAiSdkModel(openai("gpt-4o-mini"));
const interaction = createInteractionHandle({ adapters: { model } });

// run returns MaybePromise; await only if you need async.
const result = await interaction.run({ message });

if (result.state.messages[1]) {
  console.log(result.state.messages[1].content);
}
// #endregion docs

void interaction;
