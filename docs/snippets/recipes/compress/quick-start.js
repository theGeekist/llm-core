// #region docs
import { recipes } from "#recipes";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

const compress = recipes.compress().defaults({
  adapters: { model: fromAiSdkModel(openai("gpt-4o-mini")) },
});

const outcome = await compress.run({ input: "Long text here..." });

if (outcome.status === "ok") {
  /** @type {any} */
  const artefact = outcome.artefact;
  console.log(artefact.compress?.summary);
}
// #endregion docs
