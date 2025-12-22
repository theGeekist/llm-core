import { describe, expect } from "bun:test";
import { OpenAI } from "@llamaindex/openai";
import { z } from "zod";
import { fromLlamaIndexModel, Tool, toAdapterSchema } from "#adapters";
import { expectTelemetryPresence, itIfEnvAll } from "./helpers";

const itWithOpenAI = itIfEnvAll("OPENAI_API_KEY");
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000);
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini-2024-07-18";

describe("Integration model calls (LlamaIndex/OpenAI)", () => {
  itWithOpenAI(
    "generates text via OpenAI",
    async () => {
      const llm = new OpenAI({
        model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
      });
      const model = fromLlamaIndexModel(llm);
      const response = await model.generate({ prompt: "Say hi in one word." });
      expect(response.text?.length).toBeGreaterThan(0);
      expectTelemetryPresence(response);
      expect(response.meta?.modelId).toBe(process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL);
    },
    OPENAI_TIMEOUT_MS,
  );
});

describe("Integration tool calls (LlamaIndex/OpenAI)", () => {
  itWithOpenAI(
    "calls a tool",
    async () => {
      const llm = new OpenAI({
        model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
      });
      const model = fromLlamaIndexModel(llm);
      const tools = [
        Tool.create({
          name: "echo",
          description: "Echo back the provided text",
          inputSchema: toAdapterSchema(z.object({ text: z.string() })),
          execute: (input) => {
            const typed = input as { text?: string };
            return { echoed: typed.text ?? "" };
          },
        }),
      ];

      const result = await model.generate({
        prompt: "Call the echo tool with text 'hello'.",
        tools,
      });

      expect(result.toolCalls?.[0]?.name).toBe("echo");
      expectTelemetryPresence(result);
      expect(result.meta?.modelId).toBe(process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL);
    },
    OPENAI_TIMEOUT_MS,
  );
});

describe("Integration structured output (LlamaIndex/OpenAI)", () => {
  itWithOpenAI(
    "returns structured output for a schema",
    async () => {
      const llm = new OpenAI({
        model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
      });
      const model = fromLlamaIndexModel(llm);
      const schema = toAdapterSchema(
        z.object({
          answer: z.string(),
        }),
      );

      const result = await model.generate({
        prompt: "Respond with { answer: 'ok' }.",
        responseSchema: schema,
      });

      expect(result.output && typeof result.output === "object").toBe(true);
      expectTelemetryPresence(result);
      expect(result.meta?.modelId).toBe(process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL);
    },
    OPENAI_TIMEOUT_MS,
  );
});
