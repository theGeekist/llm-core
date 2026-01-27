import { describe, expect } from "bun:test";
import { OllamaEmbeddings } from "@langchain/ollama";
import { fromLangChainEmbeddings } from "#adapters";
import { itIfEnv } from "./helpers";

const itWithOllama = itIfEnv("OLLAMA_URL");
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 60_000);

describe("Integration embeddings (LangChain/Ollama)", () => {
  itWithOllama(
    "embeds text via Ollama",
    async () => {
      const baseUrl = process.env.OLLAMA_URL;
      const model = process.env.OLLAMA_EMBED_MODEL ?? "mxbai-embed-large";
      const embeddings = new OllamaEmbeddings({ baseUrl, model });
      const adapter = fromLangChainEmbeddings(embeddings);

      const vector = await adapter.embed("hello world");
      expect(vector.length).toBeGreaterThan(0);
    },
    OLLAMA_TIMEOUT_MS,
  );
});
