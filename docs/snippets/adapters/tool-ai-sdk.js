// #region docs
import { tool } from "ai";
import { z } from "zod";

/** @param {string} city */
const fetchWeather = (city) => `Sunny in ${city}`;

const weatherTool = tool({
  description: "Get current weather",
  inputSchema: z.object({ city: z.string() }),
  /** @param {{ city: string }} input */
  execute: async (input) => fetchWeather(input.city),
});
// #endregion docs

// Pass directly to llm-core - it works natively!
void weatherTool;
