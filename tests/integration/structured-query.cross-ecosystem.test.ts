import { describe, expect } from "bun:test";
import { StructuredQuery as LangChainStructuredQuery } from "@langchain/core/structured_query";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAI } from "@llamaindex/openai";
import { openai } from "@ai-sdk/openai";
import {
  fromAiSdkModel,
  fromLangChainModel,
  fromLangChainStructuredQuery,
  fromLlamaIndexModel,
} from "#adapters";
import { Recipe } from "../../src/recipes/flow";
import { bindFirst, mapMaybe } from "../../src/maybe";
import { expectTelemetryPresence, itIfEnvAll } from "./helpers";

const itWithOpenAI = itIfEnvAll("OPENAI_API_KEY");
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000);
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini-2024-07-18";

const buildQuery = () => {
  const query = new LangChainStructuredQuery("Find docs about the docs.", undefined);
  return fromLangChainStructuredQuery(query);
};

const buildPack = () =>
  Recipe.pack("structured", ({ step }) => ({
    query: step("query", ({ state }) => {
      state.query = buildQuery();
    }),
    prompt: step("prompt", ({ state }) => {
      const query = state.query as { query?: string } | undefined;
      state.prompt = `Summarize: ${query?.query ?? ""}`;
    }).dependsOn("query"),
    run: step("run", ({ state, context }) => {
      const prompt = String(state.prompt ?? "");
      const model = context.adapters?.model;
      if (!model) {
        throw new Error("Missing model adapter.");
      }
      return mapMaybe(model.generate({ prompt }), bindFirst(writeModelResult, state));
    }).dependsOn("prompt"),
  }));

const writeModelResult = (state: Record<string, unknown>, result: unknown) => {
  state.modelResult = result;
  return { output: state };
};

type AdapterModel =
  | ReturnType<typeof fromAiSdkModel>
  | ReturnType<typeof fromLangChainModel>
  | ReturnType<typeof fromLlamaIndexModel>;

const buildWorkflow = (model: AdapterModel) =>
  Recipe.flow("agent").use(buildPack()).defaults({ adapters: { model } }).build();

describe("Integration structured query (AI SDK/OpenAI)", () => {
  itWithOpenAI(
    "runs a recipe with a LangChain structured query and AI SDK model",
    async () => {
      const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const model = fromAiSdkModel(openai(modelId));
      const workflow = buildWorkflow(model);
      const result = await workflow.run({ input: "x" });

      expect(result.status).toBe("ok");
      if (result.status !== "ok") {
        return;
      }
      expect(result.artefact).toBeDefined();
      const artefact = result.artefact as { modelResult?: unknown };
      expectTelemetryPresence(artefact.modelResult as { telemetry?: unknown });
    },
    OPENAI_TIMEOUT_MS,
  );
});

describe("Integration structured query (LangChain/OpenAI)", () => {
  itWithOpenAI(
    "runs a recipe with a LangChain structured query and LangChain model",
    async () => {
      const llm = new ChatOpenAI({
        model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
      });
      const model = fromLangChainModel(llm);
      const workflow = buildWorkflow(model);
      const result = await workflow.run({ input: "x" });

      expect(result.status).toBe("ok");
      if (result.status !== "ok") {
        return;
      }
      expect(result.artefact).toBeDefined();
      const artefact = result.artefact as { modelResult?: unknown };
      expectTelemetryPresence(artefact.modelResult as { telemetry?: unknown });
    },
    OPENAI_TIMEOUT_MS,
  );
});

describe("Integration structured query (LlamaIndex/OpenAI)", () => {
  itWithOpenAI(
    "runs a recipe with a LangChain structured query and LlamaIndex model",
    async () => {
      const llm = new OpenAI({
        model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
      });
      const model = fromLlamaIndexModel(llm);
      const workflow = buildWorkflow(model);
      const result = await workflow.run({ input: "x" });

      expect(result.status).toBe("ok");
      if (result.status !== "ok") {
        return;
      }
      expect(result.artefact).toBeDefined();
      const artefact = result.artefact as { modelResult?: unknown };
      expectTelemetryPresence(artefact.modelResult as { telemetry?: unknown });
    },
    OPENAI_TIMEOUT_MS,
  );
});
