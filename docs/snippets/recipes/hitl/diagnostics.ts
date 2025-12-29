// #region docs
import { recipes } from "#recipes";
// #endregion docs

// #region docs
const gate = recipes.hitl();

// gate handle from above
const out = await gate.run({ input: "Draft a policy update." });

console.log(out.trace);
console.log(out.diagnostics);
// #endregion docs
