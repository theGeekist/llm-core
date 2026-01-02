// #region docs
import { recipes } from "#recipes";
import { fromAiSdkModel, fromAiSdkTool } from "#adapters";
import { openai } from "@ai-sdk/openai";
import { tool } from "ai";
import { z } from "zod";

// Configure once, reuse across requests.
const agent = recipes.agent().defaults({
  adapters: {
    model: fromAiSdkModel(openai("gpt-4o-mini")),
    tools: [
      fromAiSdkTool(
        "get_weather",
        tool({
          description: "Get weather by city",
          inputSchema: z.object({ city: z.string() }),
          /** @param {{ city: string }} input */
          execute: async (input) => ({ city: input.city, summary: "Sunny, 25C" }),
        }),
      ),
    ],
  },
});

const outcome = await agent.run({ input: "What's the weather in Tokyo?" });

if (outcome.status === "ok") {
  /** @type {any} */
  const artefact = outcome.artefact;
  console.log(artefact.agent?.response); // "The weather in Tokyo is..."
}
// #endregion docs
