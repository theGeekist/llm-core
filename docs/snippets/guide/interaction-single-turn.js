// #region setup
import { createInteractionPipelineWithDefaults, runInteractionPipeline } from "#interaction";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

const model = fromAiSdkModel(openai("gpt-4o-mini"));
const pipeline = createInteractionPipelineWithDefaults();
// #endregion setup

// #region run
const result = await runInteractionPipeline(pipeline, {
  input: { message: { role: "user", content: "Hello!" } },
  adapters: { model },
});
// #endregion run

// #region read
if (!isRunResult(result)) {
  throw new Error("Interaction paused.");
}

const assistant = result.artefact.messages.find(isAssistantMessage);
console.log(assistant?.content);
// #endregion read

void pipeline;

/** @param {{ role: string }} message */
function isAssistantMessage(message) {
  return message.role === "assistant";
}

/**
 * @param {import("#interaction").InteractionRunOutcome} outcome
 * @returns {boolean}
 */
function isPausedOutcome(outcome) {
  return (
    !!outcome && typeof outcome === "object" && "__paused" in outcome && outcome.__paused === true
  );
}

/**
 * @param {import("#interaction").InteractionRunOutcome} outcome
 * @returns {outcome is import("#interaction").InteractionRunResult}
 */
function isRunResult(outcome) {
  return !isPausedOutcome(outcome);
}
