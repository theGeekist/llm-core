import { describe, expect } from "bun:test";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { fromAiSdkModel, Tooling, toSchema, type ModelCall } from "#adapters";
import { expectTelemetryPresence, expectTelemetryUsage, itIfEnvAll } from "./helpers";

const itWithOpenAI = itIfEnvAll("OPENAI_API_KEY");
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000);
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini-2024-07-18";

describe("Integration model calls (AI SDK/OpenAI)", () => {
  itWithOpenAI(
    "generates text via OpenAI",
    async () => {
      const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const model = fromAiSdkModel(openai(modelId));
      const call: ModelCall = {
        prompt: "Say hi in one word.",
      };
      const result = await model.generate(call);

      expect(result.text?.length).toBeGreaterThan(0);
      expectTelemetryPresence(result);
      expectTelemetryUsage(result.telemetry?.usage);
      expect(result.meta?.modelId).toBe(modelId);
      expect(result.telemetry?.response?.modelId).toBe(modelId);
    },
    OPENAI_TIMEOUT_MS,
  );
});

describe("Integration tool calls (AI SDK/OpenAI)", () => {
  itWithOpenAI(
    "calls a tool and returns results",
    async () => {
      const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const model = fromAiSdkModel(openai(modelId));
      const tools = [
        Tooling.create({
          name: "echo",
          description: "Echo back the provided text",
          inputSchema: toSchema(z.object({ text: z.string() })),
          execute: (input) => {
            const typed = input as { text?: string };
            return { echoed: typed.text ?? "" };
          },
        }),
      ];

      const result = await model.generate({
        prompt: "Use the echo tool with the text 'hello'.",
        tools,
        toolChoice: "echo",
      });

      expect(result.toolCalls?.[0]?.name).toBe("echo");
      expect(result.toolResults?.[0]?.name).toBe("echo");
      expectTelemetryPresence(result);
      expectTelemetryUsage(result.telemetry?.usage);
      expect(result.meta?.modelId).toBe(modelId);
    },
    OPENAI_TIMEOUT_MS,
  );
});

describe("Integration structured output (AI SDK/OpenAI)", () => {
  itWithOpenAI(
    "returns structured output for a schema",
    async () => {
      const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const model = fromAiSdkModel(openai(modelId));
      const schema = toSchema(
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
      expectTelemetryUsage(result.telemetry?.usage);
      expect(result.meta?.modelId).toBe(modelId);
    },
    OPENAI_TIMEOUT_MS,
  );
});
