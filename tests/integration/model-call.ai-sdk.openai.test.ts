import { describe, expect } from "bun:test";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { fromAiSdkPrompt } from "#adapters";
import { itIfEnvAll } from "./helpers";

const itWithOpenAI = itIfEnvAll("OPENAI_API_KEY");
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000);

describe("Integration model calls (AI SDK/OpenAI)", () => {
  itWithOpenAI(
    "generates text via OpenAI",
    async () => {
      const modelId = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
      const model = openai(modelId);
      const adapterCall = fromAiSdkPrompt({ prompt: "Say hi in one word." });
      const result = await generateText({
        model,
        prompt: adapterCall.prompt ?? "Say hi in one word.",
      });

      expect(result.text.length).toBeGreaterThan(0);
    },
    OPENAI_TIMEOUT_MS,
  );
});
