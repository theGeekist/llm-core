import { describe, expect } from "bun:test";
import { openai } from "@ai-sdk/openai";
import { fromAiSdkEmbeddings } from "#adapters";
import { itIfEnv } from "./helpers";

const itWithOpenAI = itIfEnv("OPENAI_API_KEY");
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000);

describe("Integration embeddings (AI SDK/OpenAI)", () => {
  itWithOpenAI(
    "embeds text via OpenAI",
    async () => {
      const modelId = process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small";
      const model = openai.embedding(modelId);
      const adapter = fromAiSdkEmbeddings(model);

      const vector = await adapter.embed("hello world");
      expect(vector.length).toBeGreaterThan(0);
    },
    OPENAI_TIMEOUT_MS,
  );
});
