import { describe, expect } from "bun:test";
import { RetrieverQueryEngine } from "@llamaindex/core/query-engine";
import { BaseRetriever } from "@llamaindex/core/retriever";
import { Document, type NodeWithScore } from "@llamaindex/core/schema";
import { getResponseSynthesizer } from "@llamaindex/core/response-synthesizers";
import { OpenAI as LlamaOpenAI } from "@llamaindex/openai";
import { ChatOpenAI } from "@langchain/openai";
import { openai } from "@ai-sdk/openai";
import {
  fromAiSdkModel,
  fromLangChainModel,
  fromLlamaIndexModel,
  fromLlamaIndexQueryEngine,
} from "#adapters";
import { Recipe } from "../../src/recipes/flow";
import { bindFirst } from "../../src/shared/fp";
import { maybeMap } from "../../src/shared/maybe";
import { expectTelemetryPresence, itIfEnvAll } from "./helpers";

const itWithOpenAI = itIfEnvAll("OPENAI_API_KEY");
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000);
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini-2024-07-18";

class StaticRetriever extends BaseRetriever {
  private nodes: NodeWithScore[];

  constructor(nodes: NodeWithScore[]) {
    super();
    this.nodes = nodes;
  }

  async _retrieve(): Promise<NodeWithScore[]> {
    return this.nodes;
  }
}

const buildNodes = (): NodeWithScore[] => {
  const node = new Document({ text: "Hello from LlamaIndex." });
  return [{ node, score: 0.9 }];
};

const createQueryEngine = (model: string) => {
  const llm = new LlamaOpenAI({ model });
  const synthesizer = getResponseSynthesizer("compact", { llm });
  const retriever = new StaticRetriever(buildNodes());
  return new RetrieverQueryEngine(retriever, synthesizer);
};

const writeQueryResult = (state: Record<string, unknown>, result: unknown) => {
  state.queryResult = result;
  return { output: state };
};

const writeModelResult = (state: Record<string, unknown>, result: unknown) => {
  state.modelResult = result;
  return { output: state };
};

const buildPack = () =>
  Recipe.pack("query-engine", ({ step }) => ({
    query: step("query", ({ state, context }) => {
      const engine = context.adapters?.queryEngine;
      if (!engine) {
        throw new Error("Missing queryEngine adapter.");
      }
      return maybeMap(bindFirst(writeQueryResult, state), engine.query("Summarize the greeting."));
    }),
    summarize: step("summarize", ({ state, context }) => {
      const model = context.adapters?.model;
      if (!model) {
        throw new Error("Missing model adapter.");
      }
      const queryResult = state.queryResult as { text?: string } | undefined;
      const prompt = `Summarize: ${queryResult?.text ?? ""}`;
      return maybeMap(bindFirst(writeModelResult, state), model.generate({ prompt }));
    }).dependsOn("query"),
  }));

type AdapterModel =
  | ReturnType<typeof fromAiSdkModel>
  | ReturnType<typeof fromLangChainModel>
  | ReturnType<typeof fromLlamaIndexModel>;

const buildWorkflow = (
  model: AdapterModel,
  queryEngine: ReturnType<typeof fromLlamaIndexQueryEngine>,
) => Recipe.flow("agent").use(buildPack()).defaults({ adapters: { model, queryEngine } }).build();

const formatOutcomeError = (result: {
  status: string;
  error?: unknown;
  diagnostics?: unknown[];
}) => {
  if (result.status !== "error") {
    return undefined;
  }
  const error = result.error as { message?: string } | undefined;
  return {
    error: error?.message ?? String(result.error),
    diagnostics: result.diagnostics,
  };
};

const assertOutcome = (result: { status: string; artefact?: unknown; error?: unknown }) => {
  expect(result.status, JSON.stringify(formatOutcomeError(result))).toBe("ok");
  if (result.status !== "ok") {
    return;
  }
  const artefact = result.artefact as { queryResult?: { text?: string }; modelResult?: unknown };
  expect(artefact.queryResult?.text?.length ?? 0).toBeGreaterThan(0);
  expectTelemetryPresence(artefact.modelResult as { telemetry?: unknown });
};

describe("Integration query engine (AI SDK/OpenAI)", () => {
  itWithOpenAI(
    "runs a LlamaIndex query engine with an AI SDK model",
    async () => {
      const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const queryEngine = fromLlamaIndexQueryEngine(createQueryEngine(modelId));
      const model = fromAiSdkModel(openai(modelId));
      const workflow = buildWorkflow(model, queryEngine);

      const result = await workflow.run({ input: "x" });
      assertOutcome(result);
    },
    OPENAI_TIMEOUT_MS,
  );
});

describe("Integration query engine (LangChain/OpenAI)", () => {
  itWithOpenAI(
    "runs a LlamaIndex query engine with a LangChain model",
    async () => {
      const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const queryEngine = fromLlamaIndexQueryEngine(createQueryEngine(modelId));
      const model = fromLangChainModel(new ChatOpenAI({ model: modelId }));
      const workflow = buildWorkflow(model, queryEngine);

      const result = await workflow.run({ input: "x" });
      assertOutcome(result);
    },
    OPENAI_TIMEOUT_MS,
  );
});

describe("Integration query engine (LlamaIndex/OpenAI)", () => {
  itWithOpenAI(
    "runs a LlamaIndex query engine with a LlamaIndex model",
    async () => {
      const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const queryEngine = fromLlamaIndexQueryEngine(createQueryEngine(modelId));
      const model = fromLlamaIndexModel(new LlamaOpenAI({ model: modelId }));
      const workflow = buildWorkflow(model, queryEngine);

      const result = await workflow.run({ input: "x" });
      assertOutcome(result);
    },
    OPENAI_TIMEOUT_MS,
  );
});
