import { createAgent } from "@geekist/llm-core";
import type { Model } from "@geekist/llm-core/model";

declare const model: Model;

const agent = createAgent({
  model,
  instructions: "Return a clear, portable answer.",
});

const result = await agent.run("Why is the sky blue?");
console.log(result.status, result.output);

const run = agent.start("Explain it for a five-year-old.");
for await (const event of run.events()) {
  console.log(event.kind);
}
console.log((await run.result()).status);
