// #region docs
import { recipes } from "#recipes";

const workflow = recipes.loop().use(recipes.hitl());
const plan = workflow.plan();

// #endregion docs
void plan;
