import { recipes } from "#recipes";

const ingest = recipes.ingest();

// ingest handle from above
const outcome = await ingest.run(
  { sourceId: "docs:book", documents: [{ id: "intro", text: "Hello world." }] },
  { runtime: { diagnostics: "strict" } },
);

console.log(outcome.diagnostics);
console.log(outcome.trace);
