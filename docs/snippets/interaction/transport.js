// #region docs
import { createInteractionPipelineWithDefaults, runInteractionPipeline } from "#interaction";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

/** @type {import("#adapters").EventStream} */
const eventStream = {
  emit(event) {
    console.log(event.name);
    return true;
  },
};

const pipeline = createInteractionPipelineWithDefaults();
await runInteractionPipeline(pipeline, {
  input: { message: { role: "user", content: "Hello!" } },
  adapters: { model: fromAiSdkModel(openai("gpt-4o-mini")) },
  eventStream,
});
// #endregion docs
