import { recipes } from "#recipes";

const plan = recipes.ingest().plan();
console.log(plan.steps.map((step) => step.id));
