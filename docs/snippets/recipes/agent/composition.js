// #region docs
import { recipes } from "#recipes";

const supportAgent = recipes.agent().use(recipes.rag()).use(recipes.hitl());

const plan = supportAgent.explain();
console.log(plan.steps.map((step) => step.id));
// #endregion docs
