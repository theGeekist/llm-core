// #region docs
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";
import { createInteractionEngine } from "#interaction";

/** @type {import("#adapters").Message} */
const message = { role: "user", content: "Hello!" };
const model = fromAiSdkModel(openai("gpt-4o-mini"));

const engine = createInteractionEngine({ adapters: { model } });
const result = await engine.run({ message });

console.log(result.state.messages);
// #endregion docs

void engine;
