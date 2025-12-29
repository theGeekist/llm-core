// #region docs
import { tool } from "ai";
import type { Tool } from "ai";
import { z } from "zod";

const fetchWeather = (city: string) => `Sunny in ${city}`;

const weatherTool: Tool = tool({
  description: "Get current weather",
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }: { city: string }) => fetchWeather(city),
});

// Pass directly to llm-core - it works natively!
// #endregion docs
void weatherTool;
