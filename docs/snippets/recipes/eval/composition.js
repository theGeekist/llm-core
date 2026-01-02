// #region docs
import { recipes } from "#recipes";

const workflow = recipes.agent().use(recipes.eval());
const plan = workflow.plan();

// #endregion docs
void plan;
