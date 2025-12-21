import { describe, expect } from "bun:test";
import { ChatOllama } from "@langchain/ollama";
import { fromLangChainMessage } from "#adapters";
import { itIfEnvAll } from "./helpers";

const itWithOllama = itIfEnvAll("OLLAMA_URL", "OLLAMA_MODEL");
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 60_000);

describe("Integration model calls (LangChain/Ollama)", () => {
  itWithOllama(
    "generates text via ChatOllama",
    async () => {
      const model = new ChatOllama({
        baseUrl: process.env.OLLAMA_URL,
        model: process.env.OLLAMA_MODEL ?? "llama3.2",
      });

      const response = await model.invoke("Say hi in one word.");
      const content = typeof response.content === "string" ? response.content : "";
      expect(content.length).toBeGreaterThan(0);

      const adapted = fromLangChainMessage(response);
      expect(typeof adapted.content).toBe("string");
    },
    OLLAMA_TIMEOUT_MS,
  );
});
