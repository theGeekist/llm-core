// #region setup
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";
import type { InteractionRunOutcome, InteractionRunResult } from "#interaction";
import { createInteractionPipelineWithDefaults, runInteractionPipeline } from "#interaction";
// #endregion setup

// #region run
const model = fromAiSdkModel(openai("gpt-4o-mini"));
const pipeline = createInteractionPipelineWithDefaults();

const result = await runInteractionPipeline(pipeline, {
  input: { message: { role: "user", content: "Hello!" } },
  adapters: { model },
});
// #endregion run

// #region read
if ("__paused" in result && result.__paused) {
  throw new Error("Interaction paused.");
}

const runResult = assertRunResult(result);
const assistant = runResult.artefact.messages.find(isAssistantMessage);
console.log(assistant?.content);
// #endregion read

void pipeline;

function isAssistantMessage(message: { role: string }) {
  return message.role === "assistant";
}

function assertRunResult(outcome: InteractionRunOutcome): InteractionRunResult {
  return outcome as InteractionRunResult;
}
