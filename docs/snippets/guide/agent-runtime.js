// #region run
import { createBuiltinModel, createBuiltinTools } from "#adapters";
import { createAgentRuntime } from "#interaction";

const runtime = createAgentRuntime({
  model: createBuiltinModel(),
  adapters: { tools: createBuiltinTools() },
});

const outcome = await runtime.run({
  text: "Draft a launch plan for our API.",
});
if (outcome.status !== "ok") {
  throw new Error("Agent run did not complete.");
}

console.log(outcome.artefact);
// #endregion run
