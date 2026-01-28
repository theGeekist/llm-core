import { describe, expect } from "bun:test";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAI } from "@llamaindex/openai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import {
  fromAiSdkModel,
  fromLangChainModel,
  fromLangChainOutputParser,
  fromLlamaIndexModel,
  toSchema,
} from "#adapters";
import { expectTelemetryPresence, itIfEnvAll } from "./helpers";

const itWithOpenAI = itIfEnvAll("OPENAI_API_KEY");
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000);
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini-2024-07-18";

const createOutputParser = () => fromLangChainOutputParser(new StringOutputParser());
const schema = toSchema(
  z.object({
    answer: z.string(),
  }),
);
const prompt = 'Respond with JSON: { "answer": "ok" }.';

describe("Integration output parser (AI SDK/OpenAI)", () => {
  itWithOpenAI(
    "parses text output via LangChain output parser",
    async () => {
      const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const model = fromAiSdkModel(openai(modelId));
      const outputParser = createOutputParser();

      const result = await model.generate({ prompt, responseSchema: schema });
      const parsed = await outputParser.parse(result.text ?? "");

      expect(result.text?.length).toBeGreaterThan(0);
      expectTelemetryPresence(result);
      expect(parsed).toBeTruthy();
    },
    OPENAI_TIMEOUT_MS,
  );
});

describe("Integration output parser (LangChain/OpenAI)", () => {
  itWithOpenAI(
    "parses text output via LangChain output parser",
    async () => {
      const llm = new ChatOpenAI({
        model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
      });
      const model = fromLangChainModel(llm);
      const outputParser = createOutputParser();

      const result = await model.generate({ prompt, responseSchema: schema });
      const parsed = await outputParser.parse(result.text ?? "");

      expect(result.text?.length).toBeGreaterThan(0);
      expectTelemetryPresence(result);
      expect(parsed).toBeTruthy();
    },
    OPENAI_TIMEOUT_MS,
  );
});

describe("Integration output parser (LlamaIndex/OpenAI)", () => {
  itWithOpenAI(
    "parses text output via LangChain output parser",
    async () => {
      const llm = new OpenAI({
        model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
      });
      const model = fromLlamaIndexModel(llm);
      const outputParser = createOutputParser();

      const result = await model.generate({ prompt, responseSchema: schema });
      const parsed = await outputParser.parse(result.text ?? "");

      expect(result.text?.length).toBeGreaterThan(0);
      expectTelemetryPresence(result);
      expect(parsed).toBeTruthy();
    },
    OPENAI_TIMEOUT_MS,
  );
});
