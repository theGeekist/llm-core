// #region docs
import { recipes } from "#recipes";
import { fromAiSdkModel, fromLlamaIndexTool } from "#adapters";
import { openai } from "@ai-sdk/openai";
import { tool as defineTool } from "@llamaindex/core/tools";
import { z } from "zod";

// Create a raw ecosystem tool
const llamaTool = defineTool({
  name: "get_weather",
  description: "Weather lookup",
  parameters: z.object({ city: z.string() }),
  /** @param {{ city: string }} param0 */
  execute: ({ city }) => ({ city, summary: "Sunny" }),
});

const agent = recipes.agent().defaults({
  adapters: {
    model: fromAiSdkModel(openai("gpt-4o-mini")),
    // Mix LlamaIndex tool with AI SDK model
    tools: [fromLlamaIndexTool(llamaTool)],
  },
});

// #endregion docs
void agent;
