import { recipes } from "#recipes";

const plan = recipes.ingest().explain();
console.log(plan.steps.map((step) => step.id));
