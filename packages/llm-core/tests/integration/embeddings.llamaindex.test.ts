import { describe, expect } from "bun:test";
import { OpenAIEmbedding } from "@llamaindex/openai";
import { fromLlamaIndexEmbeddings } from "#adapters";
import { itIfEnvAll } from "./helpers";

const itWithOpenAI = itIfEnvAll("OPENAI_API_KEY");
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000);

describe("Integration embeddings (LlamaIndex/OpenAI)", () => {
  itWithOpenAI(
    "embeds text via OpenAIEmbedding",
    async () => {
      const embedder = new OpenAIEmbedding({
        model: process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small",
      });
      const adapter = fromLlamaIndexEmbeddings(embedder);
      const vector = await adapter.embed("hello world");
      expect(vector.length).toBeGreaterThan(0);
    },
    OPENAI_TIMEOUT_MS,
  );
});
