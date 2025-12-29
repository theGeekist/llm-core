// #region docs
import { recipes } from "#recipes";
import { fromAiSdkModel, fromLlamaIndexTool } from "#adapters";
import { openai } from "@ai-sdk/openai";
import type { BaseTool } from "@llamaindex/core/llms";
// #endregion docs

// #region docs
// Create a raw ecosystem tool
const llamaTool: BaseTool = {
  metadata: {
    name: "get_weather",
    description: "Weather lookup",
    parameters: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
  },
  call: ({ city }: { city: string }) => ({ city, summary: "Sunny" }),
};

const agent = recipes.agent().defaults({
  adapters: {
    model: fromAiSdkModel(openai("gpt-4o-mini")),
    // Mix LlamaIndex tool with AI SDK model
    tools: [fromLlamaIndexTool(llamaTool)],
  },
});
// #endregion docs

void agent;
