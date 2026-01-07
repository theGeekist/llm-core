// #region docs
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";
import { createInteractionHandle } from "#interaction";

/** @type {import("#adapters").Message} */
const message = { role: "user", content: "Hello!" };
const model = fromAiSdkModel(openai("gpt-4o-mini"));

const handle = createInteractionHandle({ adapters: { model } });
const result = await handle.run({ message });

console.log(result.state.messages);
// #endregion docs

void handle;
