// #region docs
import { recipes } from "#recipes";
// #endregion docs

// #region docs
const retrieval = recipes["rag.retrieval"]();
const synthesis = recipes["rag.synthesis"]();

const plan = recipes.rag().plan();
console.log(plan.steps.map((step) => step.id));
// #endregion docs

void retrieval;
void synthesis;
