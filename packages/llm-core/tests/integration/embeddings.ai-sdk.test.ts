import { describe, expect } from "bun:test";
import { openai } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider-v2";
import { fromAiSdkEmbeddings } from "#adapters";
import { itIfEnv, itIfEnvAll, normalizeOllamaUrl } from "./helpers";

const itWithOpenAI = itIfEnv("OPENAI_API_KEY");
const itWithOllama = itIfEnvAll("OLLAMA_URL");
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000);
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 60_000);

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

describe("Integration embeddings (AI SDK/Ollama)", () => {
  itWithOllama(
    "embeds text via Ollama",
    async () => {
      const baseURL = normalizeOllamaUrl(process.env.OLLAMA_URL ?? "");
      const modelId = process.env.OLLAMA_EMBED_MODEL ?? "mxbai-embed-large";
      const provider = createOllama({ baseURL });
      const model = provider.embedding(modelId);
      const adapter = fromAiSdkEmbeddings(model);

      const vector = await adapter.embed("hello world");
      expect(vector.length).toBeGreaterThan(0);
    },
    OLLAMA_TIMEOUT_MS,
  );
});
