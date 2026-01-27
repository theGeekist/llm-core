import { describe, expect } from "bun:test";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { fromLangChainModel, Tooling, toSchema } from "#adapters";
import { expectTelemetryPresence, itIfEnvAll } from "./helpers";

const itWithOllama = itIfEnvAll("OLLAMA_URL", "OLLAMA_MODEL");
const itWithOpenAI = itIfEnvAll("OPENAI_API_KEY");
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 60_000);
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000);

describe("Integration model calls (LangChain/Ollama)", () => {
  itWithOllama(
    "generates text via ChatOllama",
    async () => {
      const llm = new ChatOllama({
        baseUrl: process.env.OLLAMA_URL,
        model: process.env.OLLAMA_MODEL ?? "llama3.2",
      });
      const model = fromLangChainModel(llm);
      const response = await model.generate({ prompt: "Say hi in one word." });

      expect(response.text?.length).toBeGreaterThan(0);
      expectTelemetryPresence(response);
    },
    OLLAMA_TIMEOUT_MS,
  );
});

describe("Integration tool calls (LangChain/OpenAI)", () => {
  itWithOpenAI(
    "calls a tool",
    async () => {
      const llm = new ChatOpenAI({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini-2024-07-18",
      });
      const model = fromLangChainModel(llm);
      const tools = [
        Tooling.create({
          name: "echo",
          description: "Echo back the provided text",
          inputSchema: toSchema(z.object({ text: z.string() })),
        }),
      ];

      const result = await model.generate({
        prompt: "Call the echo tool with text 'hello'.",
        tools,
        toolChoice: "echo",
      });

      expect(result.toolCalls?.[0]?.name).toBe("echo");
      expectTelemetryPresence(result);
    },
    OPENAI_TIMEOUT_MS,
  );
});

describe("Integration structured output (LangChain/OpenAI)", () => {
  itWithOpenAI(
    "returns structured output for a schema",
    async () => {
      const llm = new ChatOpenAI({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini-2024-07-18",
      });
      const model = fromLangChainModel(llm);
      const schema = toSchema(
        z.object({
          answer: z.string(),
        }),
      );

      const result = await model.generate({
        prompt: "Respond with { answer: 'ok' }.",
        responseSchema: schema,
      });

      expect(result.text?.length).toBeGreaterThan(0);
      expectTelemetryPresence(result);
    },
    OPENAI_TIMEOUT_MS,
  );
});
