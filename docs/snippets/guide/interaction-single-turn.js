// #region docs
import { createInteractionPipelineWithDefaults, runInteractionPipeline } from "#interaction";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

const pipeline = createInteractionPipelineWithDefaults();
const model = fromAiSdkModel(openai("gpt-4o-mini"));

const result = await runInteractionPipeline(pipeline, {
  input: {
    message: { role: "user", content: "Summarize llm-core in one line." },
    state: { messages: [], events: [], trace: [], diagnostics: [] },
  },
  adapters: { model },
});

if (isRunResult(result)) {
  console.log(result.artefact.messages);
  console.log(result.artefact.events);
} else {
  console.log("Paused:", result.snapshot.token);
}

/**
 * @param {import("#interaction").InteractionRunOutcome} value
 * @returns {value is import("#interaction").InteractionRunResult}
 */
function isRunResult(value) {
  return !("__paused" in value);
}
// #endregion docs
