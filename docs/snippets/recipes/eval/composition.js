// #region docs
import { recipes } from "#recipes";

const workflow = recipes.agent().use(recipes.eval());
const plan = workflow.explain();

// #endregion docs
void plan;
