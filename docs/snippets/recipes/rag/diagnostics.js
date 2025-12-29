// #region docs
import { recipes } from "#recipes";
// #endregion docs

// #region docs
const rag = recipes.rag();

// rag handle from above
const outcome = await rag.run(
  { input: "Summarize the refund policy." },
  { runtime: { diagnostics: "strict" } },
);

if (outcome.status === "error") {
  console.error(outcome.diagnostics);
}

console.log(outcome.trace);
// #endregion docs
