// #region docs
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

const model = fromAiSdkModel(openai("gpt-4o-mini"));

if (!model.stream) {
  throw new Error("Model does not support streaming");
}

const stream = await model.stream({ prompt: "Explain DSP in one paragraph." });

for await (const event of stream) {
  if (event.type === "delta") {
    process.stdout.write(event.text ?? "");
  }
}
// #endregion docs
