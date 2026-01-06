// #region docs
import { collectStep, fromAiSdkModel, isPromiseLike, maybeToStep } from "#adapters";
import { openai } from "@ai-sdk/openai";

const model = fromAiSdkModel(openai("gpt-4o-mini"));

if (!model.stream) {
  throw new Error("Model does not support streaming");
}

const stepResult = maybeToStep(model.stream({ prompt: "Explain DSP in one paragraph." }));
const step = isPromiseLike(stepResult) ? await stepResult : stepResult;
const collected = collectStep(step);
const events = isPromiseLike(collected) ? await collected : collected;

for (const event of events) {
  if (event.type === "delta") {
    process.stdout.write(event.text || "");
  }
}
// #endregion docs
