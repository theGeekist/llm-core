// #region docs
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";
import { createInteractionPipelineWithDefaults, runInteractionPipeline } from "#interaction";

/** @type {import("#adapters").Message} */
const message = { role: "user", content: "Hello!" };
const model = fromAiSdkModel(openai("gpt-4o-mini"));

const pipeline = createInteractionPipelineWithDefaults();
const result = await runInteractionPipeline(pipeline, {
  input: { message },
  adapters: { model },
});

if ("__paused" in result && result.__paused) {
  throw new Error("Interaction paused.");
}

const runResult = /** @type {import("#interaction").InteractionRunResult} */ (result);

if (runResult.artefact.messages[1]) {
  console.log(runResult.artefact.messages[1].content);
}
// #endregion docs

void pipeline;
