// #region docs
import { recipes } from "#recipes";
// #endregion docs

// #region docs
const agent = recipes.agent();

// agent handle from above
const outcome = await agent.run(
  { input: "Explain our refund policy." },
  { runtime: { diagnostics: "strict" } },
);

if (outcome.status === "error") {
  console.error(outcome.diagnostics);
}

console.log(outcome.trace);
// #endregion docs
