// #region setup
import { createBuiltinModel, createBuiltinRetriever } from "#adapters";
import { recipes } from "#recipes";

const documents = [
  { id: "doc-1", text: "llm-core uses recipes, adapters, and workflows." },
  { id: "doc-2", text: "Interactions project streams into UI-ready state." },
];
// #endregion setup

// #region build
const workflow = recipes
  .agent()
  .use(recipes.rag())
  .use(recipes.hitl())
  .defaults({
    adapters: {
      model: createBuiltinModel(),
      retriever: createBuiltinRetriever(documents),
    },
  })
  .build();
// #endregion build

// #region run
const result = await workflow.run({
  // HITL pack governs pausing; the prompt just provides intent.
  input: "Summarize the docs and request approval before finalizing.",
});

if (result.status === "paused") {
  console.log("Awaiting approval token:", result.token);
}

if (result.status === "ok") {
  console.log(result.artefact);
}
// #endregion run
