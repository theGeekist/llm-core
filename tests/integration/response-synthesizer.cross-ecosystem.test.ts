import { describe, expect } from "bun:test";
import { getResponseSynthesizer } from "@llamaindex/core/response-synthesizers";
import { OpenAI as LlamaOpenAI } from "@llamaindex/openai";
import { ChatOpenAI } from "@langchain/openai";
import { openai } from "@ai-sdk/openai";
import {
  fromAiSdkModel,
  fromLangChainModel,
  fromLlamaIndexModel,
  fromLlamaIndexResponseSynthesizer,
} from "#adapters";
import { Recipe } from "../../src/recipes/flow";
import { bindFirst, maybeMap } from "../../src/maybe";
import { expectTelemetryPresence, itIfEnvAll } from "./helpers";

const itWithOpenAI = itIfEnvAll("OPENAI_API_KEY");
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000);
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini-2024-07-18";

const createSynthesizer = (model: string) => {
  const llm = new LlamaOpenAI({ model });
  return getResponseSynthesizer("compact", { llm });
};

const writeSynthesis = (state: Record<string, unknown>, result: unknown) => {
  state.synthesisResult = result;
  return { output: state };
};

const writeModelResult = (state: Record<string, unknown>, result: unknown) => {
  state.modelResult = result;
  return { output: state };
};

const buildPack = () =>
  Recipe.pack("synth", ({ step }) => ({
    synthesize: step("synthesize", ({ state, context }) => {
      const synthesizer = context.adapters?.responseSynthesizer;
      if (!synthesizer) {
        throw new Error("Missing responseSynthesizer adapter.");
      }
      return maybeMap(
        bindFirst(writeSynthesis, state),
        synthesizer.synthesize({
          query: "Summarize the docs.",
          documents: [{ text: "Adapter-first design keeps parity." }],
        }),
      );
    }),
    summarize: step("summarize", ({ state, context }) => {
      const model = context.adapters?.model;
      if (!model) {
        throw new Error("Missing model adapter.");
      }
      const synthesis = state.synthesisResult as { text?: string } | undefined;
      const prompt = `Rewrite: ${synthesis?.text ?? ""}`;
      return maybeMap(bindFirst(writeModelResult, state), model.generate({ prompt }));
    }).dependsOn("synthesize"),
  }));

type AdapterModel =
  | ReturnType<typeof fromAiSdkModel>
  | ReturnType<typeof fromLangChainModel>
  | ReturnType<typeof fromLlamaIndexModel>;

const buildWorkflow = (
  model: AdapterModel,
  responseSynthesizer: ReturnType<typeof fromLlamaIndexResponseSynthesizer>,
) =>
  Recipe.flow("agent")
    .use(buildPack())
    .defaults({ adapters: { model, responseSynthesizer } })
    .build();

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
    synthesisResult?: { text?: string };
    modelResult?: unknown;
  };
  expect(artefact.synthesisResult?.text?.length ?? 0).toBeGreaterThan(0);
  expectTelemetryPresence(artefact.modelResult as { telemetry?: unknown });
};

describe("Integration response synthesizer (AI SDK/OpenAI)", () => {
  itWithOpenAI(
    "runs a LlamaIndex synthesizer with an AI SDK model",
    async () => {
      const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const responseSynthesizer = fromLlamaIndexResponseSynthesizer(createSynthesizer(modelId));
      const model = fromAiSdkModel(openai(modelId));
      const workflow = buildWorkflow(model, responseSynthesizer);

      const result = await workflow.run({ input: "x" });
      assertOutcome(result);
    },
    OPENAI_TIMEOUT_MS,
  );
});

describe("Integration response synthesizer (LangChain/OpenAI)", () => {
  itWithOpenAI(
    "runs a LlamaIndex synthesizer with a LangChain model",
    async () => {
      const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const responseSynthesizer = fromLlamaIndexResponseSynthesizer(createSynthesizer(modelId));
      const model = fromLangChainModel(new ChatOpenAI({ model: modelId }));
      const workflow = buildWorkflow(model, responseSynthesizer);

      const result = await workflow.run({ input: "x" });
      assertOutcome(result);
    },
    OPENAI_TIMEOUT_MS,
  );
});

describe("Integration response synthesizer (LlamaIndex/OpenAI)", () => {
  itWithOpenAI(
    "runs a LlamaIndex synthesizer with a LlamaIndex model",
    async () => {
      const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
      const responseSynthesizer = fromLlamaIndexResponseSynthesizer(createSynthesizer(modelId));
      const model = fromLlamaIndexModel(new LlamaOpenAI({ model: modelId }));
      const workflow = buildWorkflow(model, responseSynthesizer);

      const result = await workflow.run({ input: "x" });
      assertOutcome(result);
    },
    OPENAI_TIMEOUT_MS,
  );
});
