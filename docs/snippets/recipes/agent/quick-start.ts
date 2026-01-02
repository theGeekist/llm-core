// #region docs
import { recipes } from "#recipes";
import type { AgentInput } from "#workflow";
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
          execute: async ({ city }: { city: string }) => ({
            city,
            summary: "Sunny, 25C",
          }),
        }),
      ),
    ],
  },
});

const input: AgentInput = { input: "What's the weather in Tokyo?" };
const outcome = await agent.run(input);

if (outcome.status === "ok") {
  const agentOutput = outcome.artefact.agent as { response?: string } | undefined;
  console.log(agentOutput?.response); // "The weather in Tokyo is..."
}
// #endregion docs
