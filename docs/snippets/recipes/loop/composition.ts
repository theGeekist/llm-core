// #region docs
import { recipes } from "#recipes";

const workflow = recipes.loop().use(recipes.hitl());
const plan = workflow.explain();

// #endregion docs
void plan;
