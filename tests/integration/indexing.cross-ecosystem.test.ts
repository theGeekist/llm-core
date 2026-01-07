import { describe, expect } from "bun:test";
import type { RecordManagerInterface } from "@langchain/core/indexing";
import type { VectorStore as LangChainVectorStore } from "@langchain/core/vectorstores";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAI as LlamaOpenAI } from "@llamaindex/openai";
import { openai } from "@ai-sdk/openai";
import {
  fromAiSdkModel,
  fromLangChainIndexing,
  fromLangChainModel,
  fromLlamaIndexModel,
} from "#adapters";
import { Recipe } from "../../src/recipes/flow";
import { bindFirst, maybeMap } from "../../src/shared/maybe";
import { expectTelemetryPresence, itIfEnvAll } from "./helpers";

const itWithOpenAI = itIfEnvAll("OPENAI_API_KEY");
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000);
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini-2024-07-18";

const createRecordManager = (): RecordManagerInterface => ({
  createSchema: async () => {},
  getTime: async () => 0,
  update: async (_keys: string[], _options: { timeAtLeast?: number }) => {
    void _keys;
    void _options;
  },
  exists: async (keys: string[]) => keys.map(() => false),
  listKeys: async (_options: { before?: number }) => {
    void _options;
    return [];
  },
  deleteKeys: async (_keys: string[]) => {
    void _keys;
  },
});

const createVectorStore = (): LangChainVectorStore =>
  ({
    addDocuments: async (docs: Array<{ pageContent: string }>) => {
      void docs;
      return [];
    },
    delete: async () => {},
  }) as unknown as LangChainVectorStore;

const writeIndexResult = (state: Record<string, unknown>, result: unknown) => {
  state.indexResult = result;
  return { output: state };
};

const writeModelResult = (state: Record<string, unknown>, result: unknown) => {
  state.modelResult = result;
  return { output: state };
};

const buildPack = () =>
  Recipe.pack("indexing", ({ step }) => ({
    index: step("index", ({ state, context }) => {
      const indexing = context.adapters?.indexing;
      if (!indexing) {
        throw new Error("Missing indexing adapter.");
      }
      return maybeMap(
        bindFirst(writeIndexResult, state),
        indexing.index({ documents: [{ text: "Indexable document." }] }),
      );
    }),
    summarize: step("summarize", ({ state, context }) => {
      const model = context.adapters?.model;
      if (!model) {
        throw new Error("Missing model adapter.");
      }
      const indexResult = state.indexResult as { added?: number } | undefined;
      const prompt = `Indexed ${indexResult?.added ?? 0} documents. Summarize this.`;
      return maybeMap(bindFirst(writeModelResult, state), model.generate({ prompt }));
    }).dependsOn("index"),
  }));

type AdapterModel =
  | ReturnType<typeof fromAiSdkModel>
  | ReturnType<typeof fromLangChainModel>
  | ReturnType<typeof fromLlamaIndexModel>;

const buildWorkflow = (model: AdapterModel, indexing: ReturnType<typeof fromLangChainIndexing>) =>
  Recipe.flow("agent").use(buildPack()).defaults({ adapters: { model, indexing } }).build();

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
  const artefact = result.artefact as {
    indexResult?: { added?: number };
    modelResult?: unknown;
  };
  expect(artefact.indexResult?.added ?? 0).toBeGreaterThanOrEqual(0);
  expectTelemetryPresence(artefact.modelResult as { telemetry?: unknown });
};

describe("Integration indexing (AI SDK/OpenAI)", () => {
  itWithOpenAI(
    "runs LangChain indexing with an AI SDK model",
    async () => {
      const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const indexing = fromLangChainIndexing(createRecordManager(), createVectorStore());
      const model = fromAiSdkModel(openai(modelId));
      const workflow = buildWorkflow(model, indexing);

      const result = await workflow.run({ input: "x" });
      assertOutcome(result);
    },
    OPENAI_TIMEOUT_MS,
  );
});

describe("Integration indexing (LangChain/OpenAI)", () => {
  itWithOpenAI(
    "runs LangChain indexing with a LangChain model",
    async () => {
      const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const indexing = fromLangChainIndexing(createRecordManager(), createVectorStore());
      const model = fromLangChainModel(new ChatOpenAI({ model: modelId }));
      const workflow = buildWorkflow(model, indexing);

      const result = await workflow.run({ input: "x" });
      assertOutcome(result);
    },
    OPENAI_TIMEOUT_MS,
  );
});

describe("Integration indexing (LlamaIndex/OpenAI)", () => {
  itWithOpenAI(
    "runs LangChain indexing with a LlamaIndex model",
    async () => {
      const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const indexing = fromLangChainIndexing(createRecordManager(), createVectorStore());
      const model = fromLlamaIndexModel(new LlamaOpenAI({ model: modelId }));
      const workflow = buildWorkflow(model, indexing);

      const result = await workflow.run({ input: "x" });
      assertOutcome(result);
    },
    OPENAI_TIMEOUT_MS,
  );
});
